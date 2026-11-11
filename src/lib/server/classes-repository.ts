import "server-only";
import { randomUUID } from "node:crypto";
import { FieldPath, type DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema, sessionAmount, sessionInputSchema } from "@/domain";
import {
  classInputSchema,
  classSchema,
  lessonInputSchema,
  lessonSchema,
} from "@/domain/classes";
import { classDocumentSchema, lessonDocumentSchema } from "@/domain/firestore";
import { normalizeSearch, searchSchema } from "@/domain/list-filters";
import { dto, operation, sessionDto, studentDto, userRef } from "./repository";
import { AppError } from "./errors";
import { listPage, listScope } from "./list-page";
import { admin } from "@/lib/firebase/admin";

export function classDto(doc: DocumentSnapshot) {
  if (doc.exists) classDocumentSchema.parse(doc.data());
  return classSchema.parse(dto(doc));
}
export function lessonDto(doc: DocumentSnapshot) {
  if (doc.exists) lessonDocumentSchema.parse(doc.data());
  return lessonSchema.parse(dto(doc));
}
export async function getClass(uid: string, id: string) {
  const root = userRef(uid);
  idSchema.parse(id);
  return admin().db.runTransaction(
    async (tx) => {
      const item = classDto(await tx.get(root.collection("classes").doc(id)));
      const students = (
        await tx.getAll(
          ...item.studentIds.map((id) => root.collection("students").doc(id)),
        )
      ).map(studentDto);
      return { ...item, students };
    },
    { readOnly: true },
  );
}
export async function saveClass(
  uid: string,
  raw: unknown,
  requestId: string,
  id?: string,
) {
  const input = classInputSchema.parse(raw);
  if (id) idSchema.parse(id);
  const resultId = id ?? randomUUID();
  return operation(
    uid,
    id ? "class-update" : "class-create",
    requestId,
    { id: id ?? null, ...input },
    async (tx, root, now) => {
      const ref = root.collection("classes").doc(resultId);
      const current = await tx.get(ref);
      const students = await tx.getAll(
        ...input.studentIds.map((id) => root.collection("students").doc(id)),
      );
      if (id && !current.exists)
        throw new AppError(404, "Không tìm thấy lớp học.");
      const previous = current.exists ? classDto(current) : null;
      for (const doc of students) {
        if (!doc.exists)
          throw new AppError(404, "Học viên không thuộc tài khoản này.");
        if (
          studentDto(doc).archivedAt &&
          !previous?.studentIds.includes(doc.id)
        )
          throw new AppError(409, "Khôi phục học viên trước khi thêm vào lớp.");
      }
      if (id) tx.update(ref, { ...input, updatedAt: now });
      else
        tx.create(ref, {
          ...input,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
        });
      return { id: resultId };
    },
  );
}
export async function archiveClass(
  uid: string,
  id: string,
  archived: boolean,
  requestId: string,
) {
  idSchema.parse(id);
  z.boolean().parse(archived);
  return operation(
    uid,
    "class-archive",
    requestId,
    { id, archived },
    async (tx, root, now) => {
      const ref = root.collection("classes").doc(id);
      if (!(await tx.get(ref)).exists)
        throw new AppError(404, "Không tìm thấy lớp học.");
      tx.update(ref, { archivedAt: archived ? now : null, updatedAt: now });
      return { id };
    },
  );
}
const classListSchema = z
  .object({
    archived: z.enum(["true", "false"]).default("false"),
    q: searchSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listClasses(uid: string, raw: unknown) {
  const input = classListSchema.parse(raw);
  return listPage({
    query: userRef(uid)
      .collection("classes")
      .orderBy("displayName")
      .orderBy(FieldPath.documentId()),
    orderField: "displayName",
    scope: listScope(uid, "classes", { archived: input.archived, q: input.q }),
    cursor: input.cursor,
    limit: input.limit,
    dto: classDto,
    matches: (item) =>
      Boolean(item.archivedAt) === (input.archived === "true") &&
      normalizeSearch(item.displayName).includes(input.q),
  });
}
export async function getLesson(uid: string, id: string) {
  const root = userRef(uid);
  idSchema.parse(id);
  return admin().db.runTransaction(
    async (tx) => {
      const item = lessonDto(await tx.get(root.collection("lessons").doc(id)));
      const sessions = (
        await tx.getAll(
          ...item.sessionIds.map((id) => root.collection("sessions").doc(id)),
        )
      ).map(sessionDto);
      if (
        sessions.length !== item.studentIds.length ||
        sessions.some(
          (s, i) =>
            s.lessonId !== item.id ||
            s.studentId !== item.studentIds[i] ||
            s.rateVnd !== item.rateVnd ||
            s.sessionDate !== item.sessionDate ||
            s.startTime !== item.startTime ||
            s.durationMinutes !== item.durationMinutes,
        )
      )
        throw new AppError(409, "Liên kết buổi học cần được kiểm tra.");
      return { ...item, sessions };
    },
    { readOnly: true },
  );
}
export async function saveLesson(
  uid: string,
  raw: unknown,
  requestId: string,
  id?: string,
) {
  const input = lessonInputSchema.parse(raw);
  if (id) idSchema.parse(id);
  if (!id && input.status === null)
    throw new AppError(400, "Chọn trạng thái cho buổi mới.");
  const resultId = id ?? randomUUID();
  // Stable IDs, generated outside the retried transaction callback.
  const newSessionIds = input.studentIds.map(() => randomUUID());
  return operation(
    uid,
    id ? "lesson-update" : "lesson-create",
    requestId,
    { id: id ?? null, ...input },
    async (tx, root, now) => {
      const ref = root.collection("lessons").doc(resultId);
      const classRef = input.classId
        ? root.collection("classes").doc(input.classId)
        : null;
      const [currentDoc, ...studentDocs] = await tx.getAll(
        ref,
        ...input.studentIds.map((id) => root.collection("students").doc(id)),
        ...(classRef ? [classRef] : []),
      );
      const classDoc = classRef ? studentDocs.pop()! : null;
      if (id && !currentDoc.exists)
        throw new AppError(404, "Không tìm thấy buổi học.");
      const current = currentDoc.exists ? lessonDto(currentDoc) : null;
      if (
        current &&
        (current.classId !== input.classId ||
          JSON.stringify(current.studentIds) !==
            JSON.stringify(input.studentIds))
      )
        throw new AppError(
          409,
          "Danh sách tham gia của buổi đã lưu được giữ cố định. Có thể hủy hoặc miễn phí riêng từng học viên.",
        );
      if (classDoc && !classDoc.exists)
        throw new AppError(404, "Không tìm thấy lớp trong tài khoản này.");
      const teachingClass = classDoc ? classDto(classDoc) : null;
      if (!id && teachingClass?.archivedAt)
        throw new AppError(409, "Khôi phục lớp trước khi ghi buổi mới.");
      if (
        !id &&
        teachingClass &&
        input.studentIds.some((id) => !teachingClass.studentIds.includes(id))
      )
        throw new AppError(
          409,
          "Danh sách lớp đã thay đổi. Vui lòng chọn lại người tham gia.",
        );
      if (!id && teachingClass && teachingClass.rateVnd !== input.rateVnd)
        throw new AppError(
          409,
          "Đơn giá lớp đã thay đổi. Tải lại lớp trước khi ghi buổi.",
        );
      const students = studentDocs.map((doc) => {
        if (!doc.exists)
          throw new AppError(404, "Học viên không thuộc tài khoản này.");
        const student = studentDto(doc);
        if (!id && student.archivedAt)
          throw new AppError(
            409,
            "Bỏ chọn học viên đã lưu trữ hoặc khôi phục trước khi ghi buổi.",
          );
        return student;
      });
      const sessionIds = current?.sessionIds ?? newSessionIds;
      const refs = sessionIds.map((id) => root.collection("sessions").doc(id));
      const previous = current
        ? (await tx.getAll(...refs)).map(sessionDto)
        : [];
      if (
        previous.some(
          (s, i) =>
            s.lessonId !== resultId || s.studentId !== input.studentIds[i],
        )
      )
        throw new AppError(409, "Liên kết buổi học cần được kiểm tra.");
      if (previous.some((s) => s.billedStatementId !== null))
        throw new AppError(
          409,
          "Đã có học viên được lập bảng kê. Không thể sửa thông tin chung của buổi.",
        );
      const { status, billable, ...shared } = input;
      const className =
        current?.className ?? teachingClass?.displayName ?? null;
      for (const [index, student] of students.entries()) {
        const old = previous[index];
        const row = sessionInputSchema.parse({
          studentId: student.id,
          sessionDate: input.sessionDate,
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          status: status ?? old?.status,
          billable: billable ?? old?.billable,
          rateVnd: input.rateVnd,
          privateNote: old?.privateNote ?? "",
        });
        const data = {
          ...row,
          rateVnd: input.rateVnd,
          amountVnd: sessionAmount({ ...row, rateVnd: input.rateVnd }),
          studentName: old?.studentName ?? student.displayName,
          lessonId: resultId,
          classId: input.classId,
          className,
          updatedAt: now,
        };
        if (id) tx.update(refs[index], data);
        else
          tx.create(refs[index], {
            ...data,
            billedStatementId: null,
            requestId,
            createdAt: now,
            schemaVersion: 1,
          });
      }
      const data = { ...shared, className, sessionIds, updatedAt: now };
      if (id) tx.update(ref, data);
      else tx.create(ref, { ...data, createdAt: now, schemaVersion: 1 });
      tx.create(
        root
          .collection("auditEvents")
          .doc(`${id ? "lesson-update" : "lesson-create"}_${requestId}`),
        {
          entityType: "lesson",
          entityId: resultId,
          action: id ? "updated" : "created",
          safeMetadata: { participantCount: input.studentIds.length },
          createdAt: now,
          schemaVersion: 1,
        },
      );
      return { id: resultId };
    },
  );
}
const lessonListSchema = z
  .object({
    classId: idSchema.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listLessons(uid: string, raw: unknown) {
  const input = lessonListSchema.parse(raw);
  if (input.classId)
    classDto(await userRef(uid).collection("classes").doc(input.classId).get());
  return listPage({
    query: userRef(uid)
      .collection("lessons")
      .orderBy("sessionDate", "desc")
      .orderBy(FieldPath.documentId(), "desc"),
    orderField: "sessionDate",
    scope: listScope(uid, "lessons", { classId: input.classId ?? null }),
    limit: input.limit,
    cursor: input.cursor,
    dto: lessonDto,
    matches: input.classId
      ? (item) => item.classId === input.classId
      : undefined,
  });
}
