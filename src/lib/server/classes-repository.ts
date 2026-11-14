import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  idSchema,
  sessionAmount,
  sessionInputSchema,
  vietnamToday,
} from "@/domain";
import {
  classInputSchema,
  classSchema,
  lessonInputSchema,
  lessonSchema,
  MAX_CLASS_STUDENTS,
  type GroupLesson,
  type WeeklySlot,
} from "@/domain/classes";
import { nextWeeklyLesson, vietnamLessonTime } from "@/domain/weekly-schedule";
import { classDocumentSchema, lessonDocumentSchema } from "@/domain/firestore";
import { normalizeSearch, searchSchema } from "@/domain/list-filters";
import {
  dto,
  operation,
  sessionDto,
  studentDto,
  userRef,
  withSessionPayments,
} from "./repository";
import { AppError } from "./errors";
import { listPage, listScope } from "./list-page";
import { chronologicalListPage, orderedListPage } from "./ordered-list-page";
import { classOrderKey } from "@/domain/record-order";
import { admin } from "@/lib/firebase/admin";
import { assertAccountWritable } from "./account-access";
import { markWorkspaceChanged } from "./workspace-cache";

function nextLessonTimestamp(slots: WeeklySlot[], after: Date) {
  const next = nextWeeklyLesson(slots, after);
  return next ? Timestamp.fromDate(next) : null;
}

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
      const weeklySchedule =
        input.weeklySchedule ?? previous?.weeklySchedule ?? [];
      const nextLessonAt =
        !previous ||
        previous.nextLessonAt === undefined ||
        JSON.stringify(weeklySchedule) !==
          JSON.stringify(previous.weeklySchedule)
          ? {
              nextLessonAt: nextLessonTimestamp(
                previous?.archivedAt ? [] : weeklySchedule,
                now.toDate(),
              ),
            }
          : {};
      if (id) tx.update(ref, { ...input, ...nextLessonAt, updatedAt: now });
      else
        tx.create(ref, {
          ...input,
          ...nextLessonAt,
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
      const current = await tx.get(ref);
      if (!current.exists) throw new AppError(404, "Không tìm thấy lớp học.");
      const item = classDto(current);
      tx.update(ref, {
        archivedAt: archived ? now : null,
        updatedAt: now,
        ...(archived || item.archivedAt || item.nextLessonAt === undefined
          ? {
              nextLessonAt: nextLessonTimestamp(
                archived ? [] : item.weeklySchedule,
                now.toDate(),
              ),
            }
          : {}),
      });
      return { id };
    },
  );
}
const classListSchema = z
  .object({
    order: z.literal("schedule").optional(),
    archived: z.enum(["true", "false", "all"]).default("false"),
    q: searchSchema,
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listClasses(uid: string, raw: unknown) {
  const input = classListSchema.parse(raw);
  if (input.order === "schedule") {
    return orderedListPage({
      read: async () =>
        (await userRef(uid).collection("classes").get()).docs
          .map(classDto)
          .filter(
            (item) =>
              (input.archived === "all" ||
                Boolean(item.archivedAt) === (input.archived === "true")) &&
              normalizeSearch(item.displayName).includes(input.q),
          ),
      key: classOrderKey,
      scope: listScope(uid, "classes-schedule", {
        archived: input.archived,
        q: input.q,
      }),
      cursor: input.cursor,
      limit: input.limit,
    });
  }
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
      (input.archived === "all" ||
        Boolean(item.archivedAt) === (input.archived === "true")) &&
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
      return {
        ...item,
        sessions: await withSessionPayments(root, sessions, tx),
      };
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
      if (!id && input.classId && input.startTime) {
        const scheduled = await tx.get(
          root
            .collection("lessons")
            .doc(
              scheduledLessonId(
                input.classId,
                input.sessionDate,
                input.startTime,
              ),
            ),
        );
        if (
          scheduled.exists &&
          scheduled.get("sessionDate") === input.sessionDate &&
          scheduled.get("startTime") === input.startTime
        )
          throw new AppError(409, "Đã có buổi học của lớp vào giờ này.");
      }
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
      const className =
        current?.className ?? teachingClass?.displayName ?? null;
      writeLesson(tx, root, {
        input,
        className,
        resultId,
        sessionIds,
        students,
        previous,
        now,
        requestId,
        update: Boolean(id),
      });
      return { id: resultId };
    },
  );
}

type LessonInput = ReturnType<typeof lessonInputSchema.parse>;

function writeLesson(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  args: {
    input: LessonInput;
    className: GroupLesson["className"];
    resultId: string;
    sessionIds: string[];
    students: ReturnType<typeof studentDto>[];
    previous: ReturnType<typeof sessionDto>[];
    now: Timestamp;
    requestId: string;
    update: boolean;
  },
) {
  const {
    input,
    className,
    resultId,
    sessionIds,
    students,
    previous,
    now,
    requestId,
    update,
  } = args;
  const { status, billable, ...shared } = input;
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
    const ref = root.collection("sessions").doc(sessionIds[index]);
    if (update) tx.update(ref, data);
    else
      tx.create(ref, {
        ...data,
        billedStatementId: null,
        requestId,
        createdAt: now,
        schemaVersion: 1,
      });
  }
  const data = { ...shared, className, sessionIds, updatedAt: now };
  const ref = root.collection("lessons").doc(resultId);
  if (update) tx.update(ref, data);
  else tx.create(ref, { ...data, createdAt: now, schemaVersion: 1 });
  tx.create(
    root
      .collection("auditEvents")
      .doc(`${update ? "lesson-update" : "lesson-create"}_${requestId}`),
    {
      entityType: "lesson",
      entityId: resultId,
      action: update ? "updated" : "created",
      safeMetadata: { participantCount: input.studentIds.length },
      createdAt: now,
      schemaVersion: 1,
    },
  );
}

function scheduledLessonId(classId: string, date: string, time: string) {
  return createHash("sha256")
    .update(JSON.stringify([classId, date, time]))
    .digest("hex");
}

export async function initializeClassSchedules(uid: string, now = new Date()) {
  const startOfToday = vietnamLessonTime(vietnamToday(now), "00:00");
  const root = userRef(uid);
  const classes = await root
    .collection("classes")
    .where("archivedAt", "==", null)
    .select("nextLessonAt", "weeklySchedule")
    .get();
  for (const doc of classes.docs) {
    if (
      doc.get("nextLessonAt") !== undefined ||
      !doc.get("weeklySchedule")?.length
    )
      continue;
    const revision = randomUUID();
    await admin().db.runTransaction(async (tx) => {
      await assertAccountWritable(tx, uid);
      const current = await tx.get(doc.ref);
      if (!current.exists) return;
      const item = classDto(current);
      if (!item.archivedAt && item.nextLessonAt === undefined) {
        tx.update(doc.ref, {
          nextLessonAt: nextLessonTimestamp(
            item.weeklySchedule,
            new Date(Math.max(startOfToday - 1, Date.parse(item.updatedAt))),
          ),
        });
        markWorkspaceChanged(tx, root, revision, ["classes"]);
      }
    });
  }
}

export async function materializeClassLessons(
  uid: string,
  now = Timestamp.now(),
) {
  const classes = userRef(uid).collection("classes");
  const due = classes
    .where("nextLessonAt", ">", Timestamp.fromMillis(0))
    .where("nextLessonAt", "<=", now)
    .orderBy("nextLessonAt");
  let remaining = 30;
  let created = 0;
  while (remaining > 0) {
    const batch = await due.limit(remaining).get();
    if (batch.empty) break;
    for (const doc of batch.docs) {
      if (
        await materializeOccurrence(uid, doc.ref, doc.get("nextLessonAt"), now)
      )
        created++;
    }
    remaining -= batch.size;
  }
  return { created };
}

async function materializeOccurrence(
  uid: string,
  ref: FirebaseFirestore.DocumentReference,
  due: Timestamp,
  now: Timestamp,
) {
  const root = userRef(uid);
  const date = vietnamToday(due.toDate());
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(due.toDate());
  const resultId = scheduledLessonId(ref.id, date, time);
  const requestId = randomUUID();
  const sessionIds = Array.from({ length: MAX_CLASS_STUDENTS }, () =>
    randomUUID(),
  );
  return admin().db.runTransaction(async (tx) => {
    await assertAccountWritable(tx, uid);
    const current = await tx.get(ref);
    if (!current.exists) return false;
    const item = classDto(current);
    if (item.archivedAt || item.nextLessonAt !== due.toDate().toISOString())
      return false;
    const lessons = root.collection("lessons");
    const [recorded, existing] = await Promise.all([
      tx.get(
        lessons.where("sessionDate", "==", date).select("classId", "startTime"),
      ),
      tx.get(lessons.doc(resultId)),
    ]);
    const students = (
      await tx.getAll(
        ...item.studentIds.map((id) => root.collection("students").doc(id)),
      )
    )
      .filter((doc) => doc.exists)
      .map(studentDto)
      .filter((student) => !student.archivedAt);
    tx.update(ref, {
      nextLessonAt: nextLessonTimestamp(item.weeklySchedule, due.toDate()),
    });
    if (
      !students.length ||
      existing.exists ||
      recorded.docs.some(
        (doc) =>
          doc.get("classId") === item.id && doc.get("startTime") === time,
      )
    ) {
      markWorkspaceChanged(tx, root, requestId, ["classes"]);
      return false;
    }
    writeLesson(tx, root, {
      input: lessonInputSchema.parse({
        classId: item.id,
        studentIds: students.map((student) => student.id),
        rateVnd: item.rateVnd,
        sessionDate: date,
        startTime: time,
        status: "planned",
        billable: true,
      }),
      className: item.displayName,
      resultId,
      sessionIds: sessionIds.slice(0, students.length),
      students,
      previous: [],
      now,
      requestId,
      update: false,
    });
    markWorkspaceChanged(tx, root, requestId, ["classes", "lessons"]);
    return true;
  });
}
const lessonListSchema = z
  .object({
    order: z.literal("chronological").optional(),
    classId: idSchema.optional(),
    type: z.enum(["all", "group"]).default("all"),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export async function listLessons(uid: string, raw: unknown) {
  const input = lessonListSchema.parse(raw);
  if (input.classId)
    classDto(await userRef(uid).collection("classes").doc(input.classId).get());
  if (input.order === "chronological") {
    return chronologicalListPage({
      query: userRef(uid)
        .collection("lessons")
        .orderBy("sessionDate", "desc")
        .orderBy(FieldPath.documentId(), "desc"),
      dto: lessonDto,
      matches: (item) =>
        (!input.classId || item.classId === input.classId) &&
        (input.type !== "group" || item.classId === null),
      scope: listScope(uid, "lessons-chronological", {
        classId: input.classId ?? null,
        type: input.type,
      }),
      cursor: input.cursor,
      limit: input.limit,
    });
  }
  return listPage({
    query: userRef(uid)
      .collection("lessons")
      .orderBy("sessionDate", "desc")
      .orderBy(FieldPath.documentId(), "desc"),
    orderField: "sessionDate",
    scope: listScope(uid, "lessons", {
      classId: input.classId ?? null,
      ...(input.type !== "all" ? { type: input.type } : {}),
    }),
    limit: input.limit,
    cursor: input.cursor,
    dto: lessonDto,
    matches:
      input.classId || input.type === "group"
        ? (item) =>
            (!input.classId || item.classId === input.classId) &&
            (input.type !== "group" || item.classId === null)
        : undefined,
  });
}
