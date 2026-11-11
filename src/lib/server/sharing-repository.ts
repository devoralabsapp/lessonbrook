import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase/admin";
import { idSchema, requestIdSchema } from "@/domain";
import { MAX_ACTIVE_PAYMENTS } from "@/domain/payments";
import { shareTokenDocumentSchema } from "@/domain/firestore";
import {
  publicStatementSchema,
  shareCreateInputSchema,
  shareRevokeInputSchema,
  shareTokenSchema,
  type PublicStatement,
  type SharePreview,
  type ShareResult,
} from "@/domain/sharing";
import { statementVersionSchema, type Statement } from "@/domain/statements";
import { AppError } from "./errors";
import { transferReferenceFor } from "./bank-shortcut";
import { maintenanceRef } from "./maintenance";
import { accountControlRef, assertAccountWritable } from "./account-access";
import { operation, userRef } from "./repository";
import { paymentDto } from "./payments-repository";
import { statementDto } from "./statements-repository";
export const tokenHash = (token: string) =>
  createHash("sha256").update(shareTokenSchema.parse(token)).digest("hex");
const publicHash = (value: PublicStatement) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tokens = () => admin().db.collection("apps/chotcong/shareTokens");
async function publicSnapshot(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  statement: Statement,
) {
  if (statement.status !== "issued")
    throw new AppError(409, "Chỉ chia sẻ bảng kê đã phát hành.");
  const docs = await tx.get(
    root
      .collection("payments")
      .where("statementId", "==", statement.id)
      .where("voidedAt", "==", null)
      .orderBy("receivedDate")
      .orderBy(FieldPath.documentId())
      .limit(MAX_ACTIVE_PAYMENTS + 1),
  );
  const payments = docs.docs.map(paymentDto);
  const totalPaid = payments.reduce(
    (sum, payment) => sum + payment.amountVnd,
    0,
  );
  if (
    payments.length !== statement.activePaymentCount ||
    totalPaid !== statement.paidVnd ||
    !Number.isSafeInteger(totalPaid) ||
    payments.some((payment) => payment.studentId !== statement.studentId)
  )
    throw new Error("Public payment invariant failed");
  return publicStatementSchema.parse({
    teacherName: statement.teacherSnapshot.displayName,
    recipientName: statement.recipientSnapshot.displayName,
    number: statement.number,
    issueDate: statement.issueDate,
    dueDate: statement.dueDate,
    items: statement.items.map(({ sessionDate, amountVnd }) => ({
      sessionDate,
      amountVnd,
    })),
    totalVnd: statement.totalVnd,
    paidVnd: statement.paidVnd,
    remainingVnd: statement.totalVnd - statement.paidVnd,
    payments: payments.map(({ receivedDate, amountVnd }) => ({
      receivedDate,
      amountVnd,
    })),
    bankDetails: statement.bankSnapshot,
    ...(statement.bankTransferSnapshot && {
      bankTransfer: statement.bankTransferSnapshot,
    }),
    ...((statement.bankSnapshot || statement.bankTransferSnapshot) && {
      transferReference: transferReferenceFor(statement),
    }),
    updatedAt: statement.updatedAt,
  });
}
export async function getSharePreview(
  uid: string,
  id: string,
): Promise<SharePreview> {
  const root = userRef(uid),
    ref = root.collection("statements").doc(idSchema.parse(id));
  return admin().db.runTransaction(
    async (tx) => {
      const statement = statementDto(await tx.get(ref));
      const payload = await publicSnapshot(tx, root, statement);
      return {
        statement: payload,
        version: statement.version,
        previewHash: publicHash(payload),
      };
    },
    { readOnly: true },
  );
}
export async function getShareStatus(uid: string, id: string) {
  const root = userRef(uid),
    ref = root.collection("statements").doc(idSchema.parse(id));
  return admin().db.runTransaction(
    async (tx) => {
      const statement = statementDto(await tx.get(ref));
      if (!statement.activeShareTokenHash || statement.status !== "issued")
        return { active: false, expiresAt: null };
      const doc = await tx.get(tokens().doc(statement.activeShareTokenHash));
      if (!doc.exists) return { active: false, expiresAt: null };
      const token = shareTokenDocumentSchema.parse(doc.data());
      const active =
        token.ownerUid === uid &&
        token.statementId === id &&
        !token.revokedAt &&
        token.expiresAt.toMillis() > Date.now();
      return {
        active,
        expiresAt: active ? token.expiresAt.toDate().toISOString() : null,
      };
    },
    { readOnly: true },
  );
}
export async function createShare(
  uid: string,
  id: string,
  raw: unknown,
  requestId: string,
): Promise<ShareResult> {
  idSchema.parse(id);
  requestIdSchema.parse(requestId);
  const input = shareCreateInputSchema.parse(raw),
    root = userRef(uid),
    statementRef = root.collection("statements").doc(id);
  const requestRef = root
    .collection("operationRequests")
    .doc(`share-create_${requestId}`);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ id, ...input }))
    .digest("hex");
  const token = randomBytes(32).toString("base64url"),
    hash = tokenHash(token),
    tokenRef = tokens().doc(hash),
    eventId = randomUUID();
  const now = Timestamp.now(),
    expiresAt = Timestamp.fromMillis(now.toMillis() + 30 * 86400000);
  const result = await admin().db.runTransaction(async (tx) => {
    await assertAccountWritable(tx, uid);
    const previous = await tx.get(requestRef);
    if (previous.exists) {
      if (previous.get("payloadHash") !== payloadHash)
        throw new AppError(409, "Yêu cầu này đã dùng cho dữ liệu khác.");
      return { created: false };
    }
    const statement = statementDto(await tx.get(statementRef));
    if (statement.version !== input.version)
      throw new AppError(
        409,
        "Bảng kê đã thay đổi. Hãy kiểm tra lại thông tin trước khi chia sẻ.",
      );
    const old = statement.activeShareTokenHash
      ? await tx.get(tokens().doc(statement.activeShareTokenHash))
      : null;
    if (
      old?.exists &&
      (old.get("ownerUid") !== uid || old.get("statementId") !== id)
    )
      throw new Error("Share ownership invariant failed");
    const snapshot = await publicSnapshot(tx, root, statement);
    if (input.previewHash && publicHash(snapshot) !== input.previewHash)
      throw new AppError(
        409,
        "Nội dung đã đổi. Hãy xem trước lại trước khi tạo link.",
      );
    if (old?.exists) tx.update(old.ref, { revokedAt: now });
    tx.create(tokenRef, {
      ownerUid: uid,
      statementId: id,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      schemaVersion: 1,
    });
    tx.update(statementRef, {
      activeShareTokenHash: hash,
      version: statementVersionSchema.parse(statement.version + 1),
      updatedAt: now,
    });
    tx.create(requestRef, {
      operation: "share-create",
      requestId,
      payloadHash,
      resultId: id,
      createdAt: now,
      schemaVersion: 1,
    });
    tx.create(root.collection("auditEvents").doc(eventId), {
      entityType: "statement",
      entityId: id,
      action: "share-created",
      safeMetadata: {},
      createdAt: now,
      schemaVersion: 1,
    });
    return { created: true };
  });
  return {
    id,
    token: result.created ? token : null,
    tokenHash: result.created ? hash : null,
    expiresAt: result.created ? expiresAt.toDate().toISOString() : null,
  };
}
export async function revokeShare(
  uid: string,
  id: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(id);
  const input = shareRevokeInputSchema.parse(raw),
    eventId = randomUUID();
  return operation(
    uid,
    "share-revoke",
    requestId,
    { id, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(id),
        statement = statementDto(await tx.get(ref));
      if (statement.status !== "issued")
        throw new AppError(409, "Chỉ quản lý link cho bảng kê đã phát hành.");
      if (statement.version !== input.version)
        throw new AppError(
          409,
          "Bảng kê đã đổi. Hãy tải lại trước khi thu hồi link.",
        );
      const old = statement.activeShareTokenHash
        ? await tx.get(tokens().doc(statement.activeShareTokenHash))
        : null;
      if (
        old?.exists &&
        (old.get("ownerUid") !== uid || old.get("statementId") !== id)
      )
        throw new Error("Share ownership invariant failed");
      if (old?.exists) tx.update(old.ref, { revokedAt: now });
      tx.update(ref, {
        activeShareTokenHash: null,
        version: statementVersionSchema.parse(statement.version + 1),
        updatedAt: now,
      });
      tx.create(root.collection("auditEvents").doc(eventId), {
        entityType: "statement",
        entityId: id,
        action: "share-revoked",
        safeMetadata: {},
        createdAt: now,
        schemaVersion: 1,
      });
      return { id };
    },
  );
}
export async function resolveShare(
  raw: string,
): Promise<PublicStatement | null> {
  const parsed = shareTokenSchema.safeParse(raw);
  if (!parsed.success) return null;
  const ref = tokens().doc(tokenHash(parsed.data));
  return admin().db.runTransaction(
    async (tx) => {
      if ((await tx.get(maintenanceRef())).exists) return null;
      const document = await tx.get(ref);
      if (!document.exists) return null;
      const token = shareTokenDocumentSchema.parse(document.data());
      if (token.revokedAt || token.expiresAt.toMillis() <= Date.now())
        return null;
      const root = userRef(token.ownerUid);
      if ((await tx.get(accountControlRef(token.ownerUid))).exists) return null;
      const statementDoc = await tx.get(
        root.collection("statements").doc(token.statementId),
      );
      if (!statementDoc.exists) return null;
      const statement = statementDto(statementDoc);
      if (
        statement.status !== "issued" ||
        statement.activeShareTokenHash !== ref.id
      )
        return null;
      return publicSnapshot(tx, root, statement);
    },
    { readOnly: true },
  );
}
