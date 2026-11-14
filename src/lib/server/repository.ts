import "server-only";
import { bankTransferInputSchema } from "@/domain/bank-transfer";
import { vietQrBanks } from "@/domain/vietqr-banks";
import { createHash, randomUUID } from "node:crypto";
import {
  AggregateField,
  FieldPath,
  Timestamp,
  type DocumentSnapshot,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import {
  dateSchema,
  idSchema,
  profileSchema,
  requestIdSchema,
  sessionAmount,
  sessionInputSchema,
  sessionSchema,
  studentInputSchema,
  studentSchema,
  type Student,
  type TeachingSession,
  TIME_ZONE,
  vietnamToday,
} from "@/domain";
import { AppError } from "./errors";
import { teacherSettingsSchema } from "@/domain/onboarding";
import type { Theme } from "@/domain/appearance";
import { listPage, listScope } from "./list-page";
import { chronologicalListPage, orderedListPage } from "./ordered-list-page";
import { studentOrderKey, lessonOrderKey } from "@/domain/record-order";
import {
  searchSchema,
  normalizeSearch,
  sessionStatusFilterSchema,
  sessionTypeFilterSchema,
  billingFilterSchema,
  matchesSession,
  sessionPaymentStatus,
  type SessionWithPayment,
} from "@/domain/list-filters";
import { statementIsPaid, statementSchema } from "@/domain/statements";
import {
  canCompleteSession,
  completedSessionFields,
  sessionCompletionSchema,
} from "@/domain/session-completion";
import { assertServiceAvailable } from "./maintenance";
import {
  accountAccessRefs,
  accountControlRef,
  assertAccountAccess,
} from "./account-access";
import {
  profileDocumentSchema,
  sessionDocumentSchema,
  studentDocumentSchema,
} from "@/domain/firestore";

// Call only with UID from verified server session. No client paths/references accepted.
export function userRef(uid: string) {
  return admin()
    .db.collection("apps")
    .doc("chotcong")
    .collection("users")
    .doc(idSchema.parse(uid));
}
export function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
export function decode(value: string) {
  if (value.length > 1000) throw new AppError(400, "Con trỏ không hợp lệ.");
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new AppError(400, "Con trỏ không hợp lệ.");
  }
}
export function dto(doc: DocumentSnapshot) {
  if (!doc.exists) throw new AppError(404, "Không tìm thấy dữ liệu.");
  const data = doc.data()!;
  const fields: Record<string, unknown> = { ...data, id: doc.id };
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      v instanceof Timestamp ? v.toDate().toISOString() : v,
    ]),
  );
}
export const studentDto = (doc: DocumentSnapshot) => {
  if (doc.exists) studentDocumentSchema.parse(doc.data());
  return studentSchema.parse(dto(doc));
};
export const sessionDto = (doc: DocumentSnapshot) => {
  if (doc.exists) sessionDocumentSchema.parse(doc.data());
  return sessionSchema.parse(dto(doc));
};
const nowIso = () => Timestamp.now();
type OperationResult<T = never> = { id: string; record?: T };

export async function operation<T = never>(
  uid: string,
  name: string,
  requestId: string,
  payload: unknown,
  action: (
    tx: FirebaseFirestore.Transaction,
    root: FirebaseFirestore.DocumentReference,
    now: Timestamp,
    documents: DocumentSnapshot[],
  ) => Promise<OperationResult<T>>,
  readRefs?: (
    root: FirebaseFirestore.DocumentReference,
  ) => FirebaseFirestore.DocumentReference[],
): Promise<OperationResult<T>> {
  requestIdSchema.parse(requestId);
  const root = userRef(uid);
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const requestRef = root
    .collection("operationRequests")
    .doc(`${name}_${requestId}`);
  const now = nowIso();
  return admin().db.runTransaction(async (tx) => {
    const [maintenance, control, previous, ...documents] = await tx.getAll(
      ...accountAccessRefs(uid),
      requestRef,
      ...(readRefs?.(root) ?? []),
    );
    assertAccountAccess(maintenance.exists, control.exists);
    if (previous.exists) {
      if (previous.get("payloadHash") !== hash)
        throw new AppError(
          409,
          "Yêu cầu này đã dùng cho dữ liệu khác. Vui lòng tải lại.",
        );
      return { id: previous.get("resultId") as string };
    }
    const result = await action(tx, root, now, documents);
    tx.create(requestRef, {
      operation: name,
      requestId,
      payloadHash: hash,
      resultId: result.id,
      createdAt: now,
      schemaVersion: 1,
    });
    return result;
  });
}

export async function ensureProfile(
  uid: string,
  displayName: string,
  email: string | null,
  theme?: Theme,
) {
  const ref = userRef(uid);
  const profile = profileSchema.parse({
    displayName: displayName || "Giáo viên",
    email,
    bankDetails: "",
    currency: "VND",
    timeZone: TIME_ZONE,
    schemaVersion: 1,
  });
  const now = nowIso();
  return admin().db.runTransaction(async (tx) => {
    await assertServiceAvailable(tx);
    if ((await tx.get(accountControlRef(uid))).exists) return false;
    const existingProfile = await tx.get(ref);
    const appearanceRef = ref.collection("preferences").doc("appearance");
    const existingAppearance = theme ? await tx.get(appearanceRef) : undefined;
    if (!existingProfile.exists)
      tx.create(ref, { ...profile, createdAt: now, updatedAt: now });
    if (theme && existingAppearance?.get("theme") !== theme)
      tx.set(appearanceRef, { theme, schemaVersion: 1, updatedAt: now });
    return true;
  });
}
export async function getProfile(uid: string) {
  const document = await userRef(uid).get();
  if (document.exists) profileDocumentSchema.parse(document.data());
  const data = dto(document);
  return {
    ...profileSchema.parse(
      Object.fromEntries(
        Object.keys(profileSchema.shape).map((k) => [k, data[k]]),
      ),
    ),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}
export async function updateProfile(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const input = teacherSettingsSchema.parse(raw);
  return operation(
    uid,
    "profile-update",
    requestId,
    input,
    async (tx, root, now) => {
      if (!(await tx.get(root)).exists)
        throw new AppError(404, "Chưa có hồ sơ.");
      tx.update(root, { ...input, updatedAt: now });
      return { id: uid };
    },
  );
}
export async function updateBankTransfer(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const { bankTransfer } = z
    .object({ bankTransfer: bankTransferInputSchema.nullable() })
    .strict()
    .parse(raw);
  const bankName = bankTransfer ? vietQrBanks[bankTransfer.bankBin] : undefined;
  if (bankTransfer && !bankName)
    throw new AppError(400, "Vui lòng chọn ngân hàng hỗ trợ VietQR.");
  const details =
    bankTransfer && bankName ? { ...bankTransfer, bankName } : null;
  return operation(
    uid,
    "bank-transfer-settings",
    requestId,
    { bankTransfer },
    async (tx, root, now) => {
      if (!(await tx.get(root)).exists)
        throw new AppError(404, "Chưa có hồ sơ.");
      tx.update(root, { bankTransfer: details, updatedAt: now });
      return { id: uid };
    },
  );
}
export async function saveStudent(
  uid: string,
  raw: unknown,
  requestId: string,
  id?: string,
) {
  const input = studentInputSchema.parse(raw);
  if (id) idSchema.parse(id);
  const resultId = id ?? randomUUID(); // Stable across transaction retries.
  return operation<Student>(
    uid,
    id ? "student-update" : "student-create",
    requestId,
    { id: id ?? null, ...input },
    async (tx, root, now, [current]) => {
      const ref = root.collection("students").doc(resultId);
      const timestamp = now.toDate().toISOString();
      if (id) {
        if (!current.exists)
          throw new AppError(404, "Không tìm thấy học viên.");
        const record = studentSchema.parse({
          ...dto(current),
          ...input,
          updatedAt: timestamp,
        });
        tx.update(ref, { ...input, updatedAt: now });
        return { id: resultId, record };
      } else {
        const fields = {
          ...input,
          archivedAt: null,
          schemaVersion: 1 as const,
        };
        tx.create(ref, {
          ...fields,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id: resultId,
          record: {
            ...fields,
            id: resultId,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      }
    },
    id ? (root) => [root.collection("students").doc(id)] : undefined,
  );
}
export async function archiveStudent(
  uid: string,
  id: string,
  archived: boolean,
  requestId: string,
) {
  idSchema.parse(id);
  z.boolean().parse(archived);
  return operation(
    uid,
    "student-archive",
    requestId,
    { id, archived },
    async (tx, root, now) => {
      const ref = root.collection("students").doc(id);
      if (!(await tx.get(ref)).exists)
        throw new AppError(404, "Không tìm thấy học viên.");
      tx.update(ref, { archivedAt: archived ? now : null, updatedAt: now });
      return { id };
    },
  );
}
export async function getStudent(uid: string, id: string) {
  return studentDto(
    await userRef(uid).collection("students").doc(idSchema.parse(id)).get(),
  );
}
export const studentListSchema = z
  .object({
    order: z.literal("name").optional(),
    archived: z.enum(["false", "true"]).default("false"),
    q: searchSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listStudents(uid: string, raw: unknown) {
  const input = studentListSchema.parse(raw);
  if (input.order === "name") {
    return orderedListPage({
      read: async () =>
        (await userRef(uid).collection("students").get()).docs
          .map(studentDto)
          .filter(
            (item) =>
              Boolean(item.archivedAt) === (input.archived === "true") &&
              normalizeSearch(item.displayName).includes(input.q),
          ),
      key: studentOrderKey,
      scope: listScope(uid, "students-name", {
        archived: input.archived,
        q: input.q,
      }),
      cursor: input.cursor,
      limit: input.limit,
    });
  }
  // archivedAt != null requires ordering by archivedAt. Active list orders by name.
  let query: Query = userRef(uid).collection("students");
  query =
    input.archived === "true"
      ? query
          .where("archivedAt", "!=", null)
          .orderBy("archivedAt", "desc")
          .orderBy(FieldPath.documentId(), "desc")
      : query
          .where("archivedAt", "==", null)
          .orderBy("displayName")
          .orderBy(FieldPath.documentId());
  return listPage({
    query,
    orderField: input.archived === "true" ? "archivedAt" : "displayName",
    scope: listScope(uid, "students", { archived: input.archived, q: input.q }),
    cursor: input.cursor,
    limit: input.limit,
    dto: studentDto,
    matches: input.q
      ? (student) => normalizeSearch(student.displayName).includes(input.q)
      : undefined,
  });
}
export async function saveSession(
  uid: string,
  raw: unknown,
  requestId: string,
  id?: string,
) {
  const input = sessionInputSchema.parse(raw);
  if (id) idSchema.parse(id);
  const resultId = id ?? randomUUID();
  return operation<TeachingSession>(
    uid,
    id ? "session-update" : "session-create",
    requestId,
    { id: id ?? null, ...input },
    async (tx, root, now, [studentDoc, currentDoc]) => {
      const ref = root.collection("sessions").doc(resultId);
      // All reads precede all writes. Student read also serializes archive/default-rate changes.
      if (!studentDoc.exists)
        throw new AppError(404, "Không tìm thấy học viên trong tài khoản này.");
      const student = studentDto(studentDoc);
      if (id && !currentDoc?.exists)
        throw new AppError(404, "Không tìm thấy buổi dạy.");
      const current = currentDoc?.exists ? sessionDto(currentDoc) : null;
      if (current?.billedStatementId != null)
        throw new AppError(409, "Buổi đã lập bảng kê không thể sửa.");
      if (current && current.studentId !== input.studentId)
        throw new AppError(400, "Không thể đổi học viên của buổi đã lưu.");
      if (
        current?.lessonId &&
        (current.sessionDate !== input.sessionDate ||
          current.startTime !== input.startTime ||
          current.durationMinutes !== input.durationMinutes ||
          (input.rateVnd !== undefined && current.rateVnd !== input.rateVnd))
      )
        throw new AppError(
          409,
          "Sửa ngày, giờ, thời lượng và đơn giá chung tại trang buổi nhóm/lớp.",
        );
      if (!id && student.archivedAt)
        throw new AppError(409, "Khôi phục học viên trước khi thêm buổi mới.");
      const savedRate =
        input.rateVnd ?? current?.rateVnd ?? student.defaultRateVnd;
      if (input.billable && savedRate === undefined)
        throw new AppError(400, "Nhập đơn giá cho buổi có tính phí.");
      const rateVnd = savedRate ?? 0;
      const data = {
        ...input,
        rateVnd,
        studentName: student.displayName,
        amountVnd: sessionAmount({ ...input, rateVnd }),
      };
      const timestamp = now.toDate().toISOString();
      if (current) {
        tx.update(ref, { ...data, updatedAt: now });
        return {
          id: resultId,
          record: { ...current, ...data, updatedAt: timestamp },
        };
      } else {
        const fields = {
          ...data,
          billedStatementId: null,
          requestId,
          schemaVersion: 1 as const,
        };
        tx.create(ref, {
          ...fields,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id: resultId,
          record: {
            ...fields,
            id: resultId,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      }
    },
    (root) => [
      root.collection("students").doc(input.studentId),
      ...(id ? [root.collection("sessions").doc(id)] : []),
    ],
  );
}
export async function completeSessions(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const ids = sessionCompletionSchema.parse(raw).ids.sort();
  return operation(
    uid,
    "sessions-complete",
    requestId,
    { ids },
    async (tx, _root, now, documents) => {
      const sessions = documents.map((doc) => {
        if (!doc.exists) throw new AppError(404, "Không tìm thấy buổi dạy.");
        const session = sessionDto(doc);
        if (!canCompleteSession(session))
          throw new AppError(
            409,
            "Trạng thái buổi đã thay đổi. Tải lại danh sách rồi chọn lại.",
          );
        return session;
      });
      for (const [index, session] of sessions.entries())
        tx.update(documents[index].ref, {
          ...completedSessionFields(session),
          updatedAt: now,
        });
      return { id: requestId };
    },
    (root) => ids.map((id) => root.collection("sessions").doc(id)),
  );
}

const paymentFields = statementSchema
  .pick({ studentId: true, status: true, totalVnd: true, paidVnd: true })
  .strip();

export async function withSessionPayments(
  root: DocumentReference,
  sessions: TeachingSession[],
  reader: Pick<Firestore, "getAll"> = root.firestore,
): Promise<SessionWithPayment[]> {
  const ids = new Set(
    sessions.flatMap((session) =>
      session.billedStatementId && sessionPaymentStatus(session)
        ? [session.billedStatementId]
        : [],
    ),
  );
  const statements = new Map<string, z.infer<typeof paymentFields>>();
  if (ids.size) {
    const docs = await reader.getAll(
      ...Array.from(ids, (id) => root.collection("statements").doc(id)),
      { fieldMask: ["studentId", "status", "totalVnd", "paidVnd"] },
    );
    for (const doc of docs) {
      if (doc.exists) statements.set(doc.id, paymentFields.parse(doc.data()));
    }
  }
  return sessions.map((session) => {
    const statement = statements.get(session.billedStatementId ?? "");
    const status = sessionPaymentStatus(session);
    return {
      ...session,
      paymentStatus:
        status &&
        statement?.studentId === session.studentId &&
        statementIsPaid(statement)
          ? "paid"
          : status,
    };
  });
}

export async function getSession(uid: string, id: string) {
  const root = userRef(uid);
  const session = sessionDto(
    await root.collection("sessions").doc(idSchema.parse(id)).get(),
  );
  const [item] = await withSessionPayments(root, [session]);
  return item;
}
export const sessionListSchema = z
  .object({
    order: z.literal("chronological").optional(),
    studentId: idSchema.optional(),
    classId: idSchema.optional(),
    lessonId: idSchema.optional(),
    status: sessionStatusFilterSchema.default("all"),
    type: sessionTypeFilterSchema.default("all"),
    billing: billingFilterSchema.default("all"),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
  );
export async function listSessions(uid: string, raw: unknown) {
  const input = sessionListSchema.parse(raw);
  if (input.studentId) await getStudent(uid, input.studentId); // Never accept a cross-namespace relation.
  const root = userRef(uid);
  let query: Query = root.collection("sessions");
  if (input.studentId) query = query.where("studentId", "==", input.studentId);
  if (input.from) query = query.where("sessionDate", ">=", input.from);
  if (input.to) query = query.where("sessionDate", "<=", input.to);
  query = query
    .orderBy("sessionDate", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  const filterByPayment =
    input.billing === "paid" || input.billing === "unpaid";
  if (input.order === "chronological" && input.studentId) {
    // Equality on studentId uses its automatic single-field index. Sorting the
    // student's history in memory also covers legacy rows without stored time keys.
    const page = await orderedListPage<SessionWithPayment>({
      read: async () => {
        const records = (
          await root
            .collection("sessions")
            .where("studentId", "==", input.studentId)
            .get()
        ).docs
          .map(sessionDto)
          .filter(
            (item) =>
              (!input.from || item.sessionDate >= input.from) &&
              (!input.to || item.sessionDate <= input.to) &&
              (!input.classId || item.classId === input.classId) &&
              (!input.lessonId || item.lessonId === input.lessonId) &&
              matchesSession(
                item,
                input.status,
                filterByPayment ? "all" : input.billing,
                input.type,
              ),
          );
        return filterByPayment
          ? (await withSessionPayments(root, records)).filter((item) =>
              matchesSession(item, input.status, input.billing, input.type),
            )
          : records;
      },
      key: lessonOrderKey,
      scope: listScope(uid, "student-sessions-chronological", {
        ...input,
        cursor: undefined,
        limit: undefined,
      }),
      cursor: input.cursor,
      limit: input.limit,
    });
    return filterByPayment
      ? page
      : { ...page, items: await withSessionPayments(root, page.items) };
  }
  if (input.order === "chronological") {
    const page = await chronologicalListPage<SessionWithPayment>({
      query,
      dto: sessionDto,
      matches: (item) =>
        (!input.classId || item.classId === input.classId) &&
        (!input.lessonId || item.lessonId === input.lessonId) &&
        matchesSession(item, input.status, input.billing, input.type),
      enrich: filterByPayment
        ? (items) => withSessionPayments(root, items)
        : undefined,
      scope: listScope(uid, "sessions-chronological", {
        ...input,
        cursor: undefined,
        limit: undefined,
      }),
      cursor: input.cursor,
      limit: input.limit,
    });
    return filterByPayment
      ? page
      : { ...page, items: await withSessionPayments(root, page.items) };
  }
  const page = await listPage<SessionWithPayment>({
    query,
    orderField: "sessionDate",
    scope: listScope(uid, "sessions", {
      studentId: input.studentId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      status: input.status,
      billing: input.billing,
      ...(input.type !== "all" ? { type: input.type } : {}),
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    }),
    cursor: input.cursor,
    limit: input.limit,
    dto: sessionDto,
    enrich: filterByPayment
      ? (items) => withSessionPayments(root, items)
      : undefined,
    matches:
      input.status !== "all" ||
      input.billing !== "all" ||
      input.type !== "all" ||
      input.classId ||
      input.lessonId
        ? (session) =>
            (!input.classId || session.classId === input.classId) &&
            (!input.lessonId || session.lessonId === input.lessonId) &&
            matchesSession(session, input.status, input.billing, input.type)
        : undefined,
  });
  return filterByPayment
    ? page
    : { ...page, items: await withSessionPayments(root, page.items) };
}
export async function getSummary(uid: string) {
  const root = userRef(uid);
  const today = vietnamToday();
  const balances = {
    totalVnd: AggregateField.sum("totalVnd"),
    paidVnd: AggregateField.sum("paidVnd"),
  };
  const issued = root.collection("statements").where("status", "==", "issued");
  const [students, unbilled, outstanding, overdue, received] =
    await Promise.all([
      root.collection("students").where("archivedAt", "==", null).count().get(),
      root
        .collection("sessions")
        .where("status", "==", "completed")
        .where("billable", "==", true)
        .where("billedStatementId", "==", null)
        .aggregate({
          count: AggregateField.count(),
          amountVnd: AggregateField.sum("amountVnd"),
        })
        .get(),
      issued.aggregate(balances).get(),
      issued.where("dueDate", "<", today).aggregate(balances).get(),
      root
        .collection("payments")
        .where("voidedAt", "==", null)
        .where("receivedDate", ">=", today.slice(0, 7) + "-01")
        .where("receivedDate", "<=", today)
        .aggregate({ amountVnd: AggregateField.sum("amountVnd") })
        .get(),
    ]);
  const values = unbilled.data();
  const safeMoney = z.number().int().nonnegative().refine(Number.isSafeInteger);
  const remaining = (data: { totalVnd: number; paidVnd: number }) =>
    safeMoney.parse(
      safeMoney.parse(data.totalVnd) - safeMoney.parse(data.paidVnd),
    );
  return {
    activeStudents: students.data().count,
    outstandingVnd: remaining(outstanding.data()),
    overdueVnd: remaining(overdue.data()),
    receivedMonthVnd: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger)
      .parse(received.data().amountVnd),
    unbilledCount: values.count,
    unbilledVnd: z
      .number()
      .int()
      .nonnegative()
      .refine(Number.isSafeInteger)
      .parse(values.amountVnd),
  };
}
