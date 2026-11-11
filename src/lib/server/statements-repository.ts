import "server-only";
import { randomUUID } from "node:crypto";
import {
  FieldPath,
  Timestamp,
  type DocumentSnapshot,
  type Query,
  type Transaction,
  type DocumentReference,
} from "firebase-admin/firestore";
import { z } from "zod";
import { dateSchema, idSchema, vietnamToday } from "@/domain";
import {
  profileDocumentSchema,
  statementDocumentSchema,
} from "@/domain/firestore";
import {
  statementDraftInputSchema,
  statementIssueInputSchema,
  statementVersionSchema,
  statementSchema,
  statementTotal,
  statementVoidInputSchema,
  type StatementDraftInput,
} from "@/domain/statements";
import { AppError } from "./errors";
import { listPage, listScope } from "./list-page";
import {
  statementFilterSchema,
  storedStatementStatus,
  matchesStatement,
} from "@/domain/list-filters";
import {
  decode,
  dto,
  encode,
  getStudent,
  operation,
  sessionDto,
  studentDto,
  userRef,
} from "./repository";

export function statementDto(doc: DocumentSnapshot) {
  if (doc.exists) statementDocumentSchema.parse(doc.data());
  const statement = statementSchema.parse(dto(doc));
  if (
    statementTotal(statement.items) !== statement.totalVnd ||
    statement.totalVnd <= 0 ||
    statement.paidVnd > statement.totalVnd ||
    new Set(statement.items.map((item) => item.sessionId)).size !==
      statement.items.length
  )
    throw new Error("Statement data invariant failed");
  return statement;
}
function audit(
  tx: Transaction,
  root: DocumentReference,
  eventId: string,
  id: string,
  action: string,
  now: Timestamp,
) {
  tx.create(root.collection("auditEvents").doc(eventId), {
    entityType: "statement",
    entityId: id,
    action,
    safeMetadata: {},
    createdAt: now,
    schemaVersion: 1,
  });
}
function assertVersion(actual: number, expected: number | undefined) {
  if (actual !== expected)
    throw new AppError(
      409,
      "Bảng kê đã thay đổi. Vui lòng tải lại trước khi tiếp tục.",
    );
}
async function readDraftSources(
  tx: Transaction,
  root: DocumentReference,
  input: StatementDraftInput,
) {
  const [profileDoc, studentDoc, ...sessionDocs] = await tx.getAll(
    root,
    root.collection("students").doc(input.studentId),
    ...input.sessionIds.map((id) => root.collection("sessions").doc(id)),
  );
  if (!profileDoc.exists)
    throw new AppError(404, "Không tìm thấy hồ sơ giáo viên.");
  const profile = profileDocumentSchema.parse(profileDoc.data());
  const student = studentDto(studentDoc);
  const sessions = sessionDocs.map(sessionDto);
  for (const session of sessions) {
    if (session.studentId !== input.studentId)
      throw new AppError(
        400,
        "Các buổi trong bảng kê phải thuộc cùng học viên.",
      );
    if (
      session.status !== "completed" ||
      !session.billable ||
      session.billedStatementId !== null ||
      session.sessionDate < input.periodStart ||
      session.sessionDate > input.periodEnd
    )
      throw new AppError(
        409,
        "Có buổi không còn đủ điều kiện hoặc đã được lập bảng kê. Hãy làm mới nháp.",
      );
    if (session.amountVnd !== session.rateVnd)
      throw new Error("Session amount invariant failed");
  }
  const items = sessions
    .map((session) => ({
      sessionId: session.id,
      sessionDate: session.sessionDate,
      amountVnd: session.rateVnd,
    }))
    .sort(
      (a, b) =>
        a.sessionDate.localeCompare(b.sessionDate) ||
        a.sessionId.localeCompare(b.sessionId),
    );
  const totalVnd = statementTotal(items);
  if (totalVnd <= 0) throw new AppError(400, "Tổng bảng kê phải lớn hơn 0đ.");
  return {
    bankTransferSnapshot: profile.bankTransfer ?? null,
    source: {
      teacherSnapshot: { displayName: profile.displayName },
      recipientSnapshot: { displayName: student.displayName },
      bankSnapshot:
        input.includeBankDetails && profile.bankDetails
          ? profile.bankDetails
          : null,
      items,
      totalVnd,
    },
  };
}

export async function saveStatementDraft(
  uid: string,
  raw: unknown,
  requestId: string,
  id?: string,
) {
  const input = statementDraftInputSchema.parse(raw);
  if (id) idSchema.parse(id);
  else if (input.version !== undefined)
    throw new AppError(400, "Nháp mới chưa có phiên bản.");
  input.sessionIds.sort();
  const resultId = id ?? randomUUID();
  const eventId = randomUUID();
  return operation(
    uid,
    id ? "statement-update" : "statement-create",
    requestId,
    { id: id ?? null, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(resultId);
      const existing = await tx.get(ref);
      const current = id ? statementDto(existing) : null;
      if (current) {
        if (current.status !== "draft")
          throw new AppError(409, "Chỉ bản nháp mới được sửa.");
        assertVersion(current.version, input.version);
      }
      const { source } = await readDraftSources(tx, root, input);
      const { sessionIds: _ids, version: _version, ...period } = input;
      void _ids;
      void _version;
      const data = {
        ...period,
        ...source,
        status: "draft" as const,
        number: null,
        issueDate: null,
        issuedAt: null,
        paidVnd: 0,
        activePaymentCount: 0,
        activeShareTokenHash: null,
        voidedAt: null,
        voidReason: null,
        version: (current?.version ?? 0) + 1,
        createdAt: current ? (existing.get("createdAt") as Timestamp) : now,
        updatedAt: now,
        schemaVersion: 1 as const,
      };
      statementDocumentSchema.parse(data);
      if (Buffer.byteLength(JSON.stringify(data), "utf8") > 64_000)
        throw new AppError(
          400,
          "Bảng kê quá lớn. Hãy chia thành nhiều bảng kê.",
        );
      if (current) tx.set(ref, data);
      else tx.create(ref, data);
      audit(
        tx,
        root,
        eventId,
        resultId,
        current ? "draft-updated" : "draft-created",
        now,
      );
      return { id: resultId };
    },
  );
}

export async function issueStatement(
  uid: string,
  id: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(id);
  const input = statementIssueInputSchema.parse(raw);
  const eventId = randomUUID();
  return operation(
    uid,
    "statement-issue",
    requestId,
    { id, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(id);
      const draft = statementDto(await tx.get(ref));
      if (draft.status !== "draft")
        throw new AppError(409, "Bảng kê này không còn là bản nháp.");
      assertVersion(draft.version, input.version);
      const issueDate = vietnamToday(now.toDate());
      const counterRef = root.collection("counters").doc(issueDate.slice(0, 4));
      const counter = await tx.get(counterRef);
      const previous = counter.exists
        ? z
            .number()
            .int()
            .min(0)
            .max(999_999_999)
            .parse(counter.get("lastValue"))
        : 0;
      if (previous === 999_999_999)
        throw new AppError(409, "Bộ đếm bảng kê đã đạt giới hạn.");
      const { source, bankTransferSnapshot } = await readDraftSources(tx, root, {
        ...draft,
        sessionIds: draft.items.map((item) => item.sessionId),
      });
      if (
        JSON.stringify(source.items) !== JSON.stringify(draft.items) ||
        JSON.stringify(source.teacherSnapshot) !==
          JSON.stringify(draft.teacherSnapshot) ||
        JSON.stringify(source.recipientSnapshot) !==
          JSON.stringify(draft.recipientSnapshot) ||
        (!bankTransferSnapshot && source.bankSnapshot !== draft.bankSnapshot)
      )
        throw new AppError(
          409,
          "Buổi dạy hoặc thông tin bảng kê đã thay đổi. Mở sửa nháp, kiểm tra và lưu lại trước khi phát hành.",
        );
      // Every check/read above precedes writes; sessions are the shared contention points.
      for (const item of source.items)
        tx.update(root.collection("sessions").doc(item.sessionId), {
          billedStatementId: id,
          updatedAt: now,
        });
      const number = `CC-${issueDate.slice(0, 4)}-${String(previous + 1).padStart(6, "0")}`;
      tx.set(counterRef, {
        lastValue: previous + 1,
        updatedAt: now,
        schemaVersion: 1,
      });
      tx.update(ref, {
        ...source,
        ...(bankTransferSnapshot && {
          bankTransferSnapshot,
          bankSnapshot: null,
        }),
        status: "issued",
        number,
        issueDate,
        issuedAt: now,
        paidVnd: 0,
        activePaymentCount: 0,
        activeShareTokenHash: null,
        updatedAt: now,
        version: statementVersionSchema.parse(draft.version + 1),
      });
      audit(tx, root, eventId, id, "issued", now);
      return { id };
    },
  );
}

export async function voidStatement(
  uid: string,
  id: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(id);
  const input = statementVoidInputSchema.parse(raw);
  const eventId = randomUUID();
  return operation(
    uid,
    "statement-void",
    requestId,
    { id, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(id);
      const statement = statementDto(await tx.get(ref));
      if (statement.status !== "issued")
        throw new AppError(409, "Chỉ bảng kê đã phát hành mới được hủy.");
      assertVersion(statement.version, input.version);
      if (statement.paidVnd !== 0 || statement.activePaymentCount !== 0)
        throw new AppError(409, "Không thể hủy bảng kê còn khoản thu hợp lệ.");
      const sessions = (
        await tx.getAll(
          ...statement.items.map((item) =>
            root.collection("sessions").doc(item.sessionId),
          ),
        )
      ).map(sessionDto);
      if (
        sessions.some(
          (session) =>
            session.billedStatementId !== id ||
            session.studentId !== statement.studentId,
        )
      )
        throw new AppError(
          409,
          "Liên kết buổi dạy không khớp bảng kê. Vui lòng đối chiếu trước khi hủy.",
        );
      const tokenRef = statement.activeShareTokenHash
        ? root.firestore.doc(
            `apps/chotcong/shareTokens/${statement.activeShareTokenHash}`,
          )
        : null;
      const token = tokenRef ? await tx.get(tokenRef) : null;
      if (
        token?.exists &&
        (token.get("ownerUid") !== uid || token.get("statementId") !== id)
      )
        throw new AppError(409, "Liên kết chia sẻ không khớp bảng kê.");
      for (const session of sessions)
        tx.update(root.collection("sessions").doc(session.id), {
          billedStatementId: null,
          updatedAt: now,
        });
      if (token?.exists) tx.update(token.ref, { revokedAt: now });
      tx.update(ref, {
        status: "void",
        voidedAt: now,
        voidReason: input.reason,
        activeShareTokenHash: null,
        updatedAt: now,
        version: statementVersionSchema.parse(statement.version + 1),
      });
      audit(tx, root, eventId, id, "voided", now);
      return { id };
    },
  );
}
export async function getStatement(uid: string, id: string) {
  return statementDto(
    await userRef(uid).collection("statements").doc(idSchema.parse(id)).get(),
  );
}
const eligibleSchema = z
  .object({
    studentId: idSchema,
    periodStart: dateSchema,
    periodEnd: dateSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict()
  .refine(
    (value) => value.periodStart <= value.periodEnd,
    "Khoảng ngày không hợp lệ.",
  );
export async function listEligibleSessions(uid: string, raw: unknown) {
  const input = eligibleSchema.parse(raw);
  await getStudent(uid, input.studentId); // Archived students remain eligible for past sessions.
  let query: Query = userRef(uid)
    .collection("sessions")
    .where("studentId", "==", input.studentId)
    .where("status", "==", "completed")
    .where("billable", "==", true)
    .where("billedStatementId", "==", null)
    .where("sessionDate", ">=", input.periodStart)
    .where("sessionDate", "<=", input.periodEnd)
    .orderBy("sessionDate")
    .orderBy(FieldPath.documentId());
  if (input.cursor) {
    const cursor = z
      .object({ date: dateSchema, id: idSchema })
      .strict()
      .parse(decode(input.cursor));
    query = query.startAfter(cursor.date, cursor.id);
  }
  const docs = (await query.limit(input.limit + 1).get()).docs;
  const page = docs.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map(sessionDto),
    nextCursor:
      docs.length > input.limit && last
        ? encode({ date: last.get("sessionDate"), id: last.id })
        : null,
  };
}
const listSchema = z
  .object({
    status: statementFilterSchema.default("all"),
    studentId: idSchema.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listStatements(uid: string, raw: unknown) {
  const input = listSchema.parse(raw);
  if (input.studentId) await getStudent(uid, input.studentId);
  let query: Query = userRef(uid).collection("statements");
  const status = storedStatementStatus(input.status);
  if (status !== "all") query = query.where("status", "==", status);
  if (input.studentId) query = query.where("studentId", "==", input.studentId);
  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  const today = vietnamToday();
  return listPage({
    query,
    orderField: "createdAt",
    scope: listScope(uid, "statements", {
      status: input.status,
      studentId: input.studentId ?? null,
      today: input.status === "overdue" ? today : null,
    }),
    cursor: input.cursor,
    limit: input.limit,
    dto: statementDto,
    matches:
      status !== input.status
        ? (statement) => matchesStatement(statement, input.status, today)
        : undefined,
  });
}
