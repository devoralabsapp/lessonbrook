import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema, vietnamToday } from "@/domain";
import {
  MAX_ACTIVE_PAYMENTS,
  paymentEditInputSchema,
  paymentInputSchema,
  paymentSchema,
  paymentVoidInputSchema,
} from "@/domain/payments";
import { paymentDocumentSchema } from "@/domain/firestore";
import {
  statementMoneySchema,
  statementVersionSchema,
} from "@/domain/statements";
import { AppError } from "./errors";
import { decode, dto, encode, operation, userRef } from "./repository";
import { getStatement, statementDto } from "./statements-repository";
import {
  assertBankShortcutActive,
  transferReferenceFor,
} from "./bank-shortcut";
export const paymentDto = (doc: FirebaseFirestore.DocumentSnapshot) => {
  if (doc.exists) paymentDocumentSchema.parse(doc.data());
  return paymentSchema.parse(dto(doc));
};
function audit(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  id: string,
  paymentId: string,
  action: string,
  now: Timestamp,
) {
  tx.create(root.collection("auditEvents").doc(id), {
    entityType: "payment",
    entityId: paymentId,
    action,
    safeMetadata: {},
    createdAt: now,
    schemaVersion: 1,
  });
}
function writePayment(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  statementDoc: FirebaseFirestore.DocumentSnapshot,
  input: z.infer<typeof paymentInputSchema>,
  meta: {
    requestId: string;
    paymentId: string;
    eventId: string;
    now: Timestamp;
    bankNotice?: boolean;
  },
) {
  const statement = statementDto(statementDoc);
  const { requestId, paymentId, eventId, now } = meta;
  if (statement.status !== "issued")
    throw new AppError(409, "Chỉ ghi nhận tiền cho bảng kê đã phát hành.");
  if (input.receivedDate > vietnamToday(now.toDate()))
    throw new AppError(400, "Ngày nhận tiền không được nằm trong tương lai.");
  const remainingVnd = statement.totalVnd - statement.paidVnd;
  if (meta.bankNotice && input.amountVnd !== remainingVnd)
    throw new AppError(
      409,
      "Số tiền trong thông báo không khớp khoản còn phải thu.",
    );
  if (input.amountVnd > remainingVnd)
    throw new AppError(
      409,
      "Số tiền vượt khoản còn phải thu. Hãy tải lại bảng kê để đối chiếu.",
    );
  if (statement.activePaymentCount >= MAX_ACTIVE_PAYMENTS)
    throw new AppError(
      409,
      "Bản thử nghiệm hỗ trợ tối đa 100 khoản thu hợp lệ cho một bảng kê.",
    );
  const data = paymentDocumentSchema.parse({
    ...input,
    statementId: statement.id,
    studentId: statement.studentId,
    recordedAt: now,
    voidedAt: null,
    voidReason: null,
    requestId,
    schemaVersion: 1,
  });
  tx.create(root.collection("payments").doc(paymentId), data);
  tx.update(statementDoc.ref, {
    paidVnd: statementMoneySchema.parse(statement.paidVnd + input.amountVnd),
    activePaymentCount: statement.activePaymentCount + 1,
    version: statementVersionSchema.parse(statement.version + 1),
    updatedAt: now,
  });
  audit(
    tx,
    root,
    eventId,
    paymentId,
    meta.bankNotice ? "recorded_from_bank_notice" : "recorded",
    now,
  );
  return { id: paymentId };
}
export async function recordPayment(
  uid: string,
  statementId: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(statementId);
  const input = paymentInputSchema.parse(raw);
  const paymentId = randomUUID(),
    eventId = randomUUID();
  return operation(
    uid,
    "payment-create",
    requestId,
    { statementId, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(statementId);
      return writePayment(tx, root, await tx.get(ref), input, {
        requestId,
        paymentId,
        eventId,
        now,
      });
    },
  );
}
export async function recordBankPayment(
  uid: string,
  keyHash: string,
  accountNumber: string,
  reference: string,
  amountVnd: number,
) {
  const payload = { reference, amountVnd };
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  // UUID-shaped key stays stable across Shortcuts retries, including after a payment is voided.
  const requestId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const paymentId = randomUUID(),
    eventId = randomUUID();
  const number = reference.slice(0, reference.lastIndexOf("-"));
  return operation<true>(
    uid,
    "bank-transfer",
    requestId,
    payload,
    async (tx, root, now) => {
      await assertBankShortcutActive(tx, uid, keyHash, accountNumber);
      const matches = await tx.get(
        root.collection("statements").where("number", "==", number).limit(2),
      );
      const statement =
        matches.size === 1 ? statementDto(matches.docs[0]) : null;
      if (!statement || transferReferenceFor(statement) !== reference)
        throw new AppError(404, "Không tìm thấy bảng kê khớp mã chuyển khoản.");
      if (
        statement.bankTransferSnapshot &&
        statement.bankTransferSnapshot.accountNumber !== accountNumber
      )
        throw new AppError(409, "Tài khoản nhận tiền không khớp bảng kê.");
      const input = paymentInputSchema.parse({
        amountVnd,
        receivedDate: vietnamToday(now.toDate()),
        method: "transfer",
      });
      const result = writePayment(tx, root, matches.docs[0], input, {
        requestId,
        paymentId,
        eventId,
        now,
        bankNotice: true,
      });
      return { ...result, record: true };
    },
  );
}
export async function voidPayment(
  uid: string,
  paymentId: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(paymentId);
  const input = paymentVoidInputSchema.parse(raw),
    eventId = randomUUID();
  return operation(
    uid,
    "payment-void",
    requestId,
    { paymentId, ...input },
    async (tx, root, now) => {
      const { ref, payment, statementRef, statement } = await readActivePayment(
        tx,
        root,
        paymentId,
      );
      tx.update(ref, { voidedAt: now, voidReason: input.reason });
      tx.update(statementRef, {
        paidVnd: statementMoneySchema.parse(
          statement.paidVnd - payment.amountVnd,
        ),
        activePaymentCount: statement.activePaymentCount - 1,
        version: statementVersionSchema.parse(statement.version + 1),
        updatedAt: now,
      });
      audit(tx, root, eventId, paymentId, "voided", now);
      return { id: paymentId };
    },
  );
}
async function readActivePayment(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  paymentId: string,
) {
  const ref = root.collection("payments").doc(paymentId);
  const payment = paymentDto(await tx.get(ref));
  const statementRef = root.collection("statements").doc(payment.statementId);
  const statement = statementDto(await tx.get(statementRef));
  if (
    payment.voidedAt ||
    statement.status !== "issued" ||
    statement.studentId !== payment.studentId
  )
    throw new AppError(
      409,
      "Khoản thu không còn hợp lệ hoặc không khớp bảng kê.",
    );
  if (statement.activePaymentCount < 1 || statement.paidVnd < payment.amountVnd)
    throw new Error("Payment aggregate invariant failed");
  return { ref, payment, statementRef, statement };
}
export async function updatePayment(
  uid: string,
  paymentId: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(paymentId);
  const { expectedUpdatedAt, ...changes } = paymentEditInputSchema.parse(raw);
  const eventId = randomUUID();
  return operation(
    uid,
    "payment-edit",
    requestId,
    { paymentId, expectedUpdatedAt, ...changes },
    async (tx, root, now) => {
      const { ref, payment, statementRef, statement } = await readActivePayment(
        tx,
        root,
        paymentId,
      );
      if ((payment.updatedAt ?? null) !== expectedUpdatedAt)
        throw new AppError(
          409,
          "Khoản thu đã thay đổi. Vui lòng tải lại để chỉnh sửa.",
        );
      if (changes.receivedDate > vietnamToday(now.toDate()))
        throw new AppError(
          400,
          "Ngày nhận tiền không được nằm trong tương lai.",
        );
      const paidVnd = statement.paidVnd - payment.amountVnd + changes.amountVnd;
      if (paidVnd > statement.totalVnd)
        throw new AppError(
          409,
          "Số tiền vượt khoản còn phải thu. Hãy tải lại bảng kê để đối chiếu.",
        );
      tx.update(ref, { ...changes, updatedAt: now });
      tx.update(statementRef, {
        paidVnd: statementMoneySchema.parse(paidVnd),
        version: statementVersionSchema.parse(statement.version + 1),
        updatedAt: now,
      });
      audit(tx, root, eventId, paymentId, "edited", now);
      return { id: paymentId };
    },
  );
}
export async function listPayments(
  uid: string,
  statementId: string,
  raw: unknown,
) {
  await getStatement(uid, idSchema.parse(statementId));
  const input = z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict()
    .parse(raw);
  let query = userRef(uid)
    .collection("payments")
    .where("statementId", "==", statementId)
    .orderBy("receivedDate", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (input.cursor) {
    const cursor = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), id: idSchema })
      .strict()
      .parse(decode(input.cursor));
    query = query.startAfter(cursor.date, cursor.id);
  }
  const docs = (await query.limit(input.limit + 1).get()).docs,
    page = docs.slice(0, input.limit),
    last = page.at(-1);
  return {
    items: page.map(paymentDto),
    nextCursor:
      docs.length > input.limit && last
        ? encode({ date: last.get("receivedDate"), id: last.id })
        : null,
  };
}
