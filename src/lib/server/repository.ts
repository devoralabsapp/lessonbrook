import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  AggregateField,
  FieldPath,
  Timestamp,
  type DocumentSnapshot,
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
import {
  searchSchema,
  normalizeSearch,
  sessionStatusFilterSchema,
  billingFilterSchema,
  matchesSession,
} from "@/domain/list-filters";
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
  ) => Promise<OperationResult<T>>,
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
    const [maintenance, control, previous] = await tx.getAll(
      ...accountAccessRefs(uid),
      requestRef,
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
    const result = await action(tx, root, now);
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
    async (tx, root, now) => {
      const ref = root.collection("students").doc(resultId);
      const timestamp = now.toDate().toISOString();
      if (id) {
        const current = await tx.get(ref);
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
    archived: z.enum(["false", "true"]).default("false"),
    q: searchSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listStudents(uid: string, raw: unknown) {
  const input = studentListSchema.parse(raw);
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
    async (tx, root, now) => {
      const ref = root.collection("sessions").doc(resultId);
      // All reads precede all writes. Student read also serializes archive/default-rate changes.
      const studentRef = root.collection("students").doc(input.studentId);
      const [studentDoc, currentDoc] = id
        ? await tx.getAll(studentRef, ref)
        : ([await tx.get(studentRef), null] as const);
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
      const rateVnd =
        input.rateVnd ?? current?.rateVnd ?? student.defaultRateVnd;
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
  );
}
export async function getSession(uid: string, id: string) {
  return sessionDto(
    await userRef(uid).collection("sessions").doc(idSchema.parse(id)).get(),
  );
}
export const sessionListSchema = z
  .object({
    studentId: idSchema.optional(),
    status: sessionStatusFilterSchema.default("all"),
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
  let query: Query = userRef(uid).collection("sessions");
  if (input.studentId) query = query.where("studentId", "==", input.studentId);
  if (input.from) query = query.where("sessionDate", ">=", input.from);
  if (input.to) query = query.where("sessionDate", "<=", input.to);
  query = query
    .orderBy("sessionDate", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  return listPage({
    query,
    orderField: "sessionDate",
    scope: listScope(uid, "sessions", {
      studentId: input.studentId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      status: input.status,
      billing: input.billing,
    }),
    cursor: input.cursor,
    limit: input.limit,
    dto: sessionDto,
    matches:
      input.status !== "all" || input.billing !== "all"
        ? (session) => matchesSession(session, input.status, input.billing)
        : undefined,
  });
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
