import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  sessionAmount,
  sessionInputSchema,
  studentInputSchema,
  vietnamToday,
  type TeachingSession,
} from "@/domain";
import { appearanceInputSchema } from "@/domain/appearance";
import {
  bankTransferInputSchema,
  MAX_TRANSFER_MEMO_LENGTH,
} from "@/domain/bank-transfer";
import { vietQrBanks } from "@/domain/vietqr-banks";
import {
  classInputSchema,
  lessonInputSchema,
  type GroupLesson,
} from "@/domain/classes";
import { csvLine } from "@/domain/csv";
import { exportInputSchema, exportPageInputSchema } from "@/domain/data";
import {
  matchesSession,
  matchesStatement,
  matchesStatementDate,
  statementDateRangeSchema,
  normalizeSearch,
} from "@/domain/list-filters";
import { teacherSettingsSchema } from "@/domain/onboarding";
import {
  paymentEditInputSchema,
  paymentInputSchema,
  paymentVoidInputSchema,
  type Payment,
} from "@/domain/payments";
import {
  shareCreateInputSchema,
  shareRevokeInputSchema,
  shareTokenSchema,
  type PublicStatement,
} from "@/domain/sharing";
import {
  addBusinessDays,
  statementDraftInputSchema,
  statementIssueInputSchema,
  statementTotal,
  statementVoidInputSchema,
  type Statement,
} from "@/domain/statements";
import {
  sortUpcomingLessons,
  type UpcomingLesson,
} from "@/domain/upcoming-schedule";
import { vietnamLessonTime } from "@/domain/weekly-schedule";
import { AppError } from "@/lib/server/errors";
import { createDemoWorkspace, type DemoWorkspace } from "./sample-data";

export type DemoCommand = {
  path: string;
  method: "GET" | "POST" | "PATCH";
  body?: unknown;
  id: string;
  at: string;
};

const sum = <T>(items: T[], amount: (item: T) => number) =>
  items.reduce((total, item) => total + amount(item), 0);
const compare = (a: string, b: string) => a.localeCompare(b);
const oldest = (a: TeachingSession, b: TeachingSession) =>
  compare(a.sessionDate, b.sessionDate) || compare(a.id, b.id);
const hash = (value: string) => createHash("sha256").update(value);

function find<T extends { id: string }>(records: T[], id: string) {
  const record = records.find((item) => item.id === id);
  if (!record) throw new AppError(404, "Không tìm thấy dữ liệu.");
  return record;
}

function store<T extends { id: string }>(records: T[], record: T) {
  const index = records.findIndex(({ id }) => id === record.id);
  if (index < 0) records.push(record);
  else records[index] = record;
  return { id: record.id, record };
}

function page<T>(items: T[], query: URLSearchParams, defaultLimit = 20) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(query.get("limit") ?? defaultLimit);
  const start = z.coerce
    .number()
    .int()
    .min(0)
    .parse(query.get("cursor") ?? 0);
  return {
    items: items.slice(start, start + limit),
    nextCursor: start + limit < items.length ? String(start + limit) : null,
  };
}

function assertVersion(statement: Statement, version: number | undefined) {
  if (statement.version !== version)
    throw new AppError(
      409,
      "Bảng kê đã thay đổi. Hãy kiểm tra lại thông tin trước khi chia sẻ.",
    );
}

function activePayments(state: DemoWorkspace, id: string) {
  return state.payments.filter((p) => p.statementId === id && !p.voidedAt);
}

function canBill(
  session: TeachingSession,
  studentId: string,
  from: string,
  to: string,
  statementId: string | null,
) {
  return (
    session.studentId === studentId &&
    session.sessionDate >= from &&
    session.sessionDate <= to &&
    session.status === "completed" &&
    session.billable &&
    session.amountVnd > 0 &&
    (session.billedStatementId === null ||
      session.billedStatementId === statementId)
  );
}

function transferReference(statement: Statement) {
  if (statement.status !== "issued" || !statement.number) return null;
  const size = MAX_TRANSFER_MEMO_LENGTH - statement.number.length - 1;
  return `${statement.number}-${hash(statement.id).digest("hex").slice(0, size).toUpperCase()}`;
}

export function demoOnboarding(state = createDemoWorkspace(vietnamToday())) {
  return {
    profile: {
      displayName: state.profile.displayName,
      bankDetails: state.profile.bankDetails,
    },
    profileConfirmed: true,
    student: state.students.find((s) => !s.archivedAt) ?? null,
    session: state.sessions.find((s) => s.status === "completed") ?? null,
    completed: true,
  };
}

function summary(state: DemoWorkspace) {
  const outstanding = state.statements.filter((s) => s.status === "issued");
  const unbilled = state.sessions.filter((s) =>
    matchesSession(s, "all", "unbilled"),
  );
  const balance = (s: Statement) => s.totalVnd - s.paidVnd;
  return {
    activeStudents: state.students.filter((s) => !s.archivedAt).length,
    outstandingVnd: sum(outstanding, balance),
    overdueVnd: sum(
      outstanding.filter((s) => s.dueDate < state.today),
      balance,
    ),
    receivedMonthVnd: sum(
      state.payments.filter(
        (p) =>
          !p.voidedAt && p.receivedDate.slice(0, 7) === state.today.slice(0, 7),
      ),
      (p) => p.amountVnd,
    ),
    unbilledCount: unbilled.length,
    unbilledVnd: sum(unbilled, (s) => s.amountVnd),
  };
}

function schedule(state: DemoWorkspace, now: string) {
  const through = addBusinessDays(state.today, 7);
  const items = new Map<string, UpcomingLesson>();
  for (const session of state.sessions) {
    if (
      session.status !== "planned" ||
      session.sessionDate < state.today ||
      session.sessionDate > through
    )
      continue;
    const id = session.lessonId ?? session.id;
    items.set(id, {
      id,
      kind: session.lessonId ? "group" : "individual",
      name: session.lessonId
        ? (session.className ?? null)
        : session.studentName,
      date: session.sessionDate,
      time: session.startTime,
    });
  }
  const recurring: UpcomingLesson[] = [];
  for (const item of state.classes.filter((c) => !c.archivedAt)) {
    for (let offset = 0; offset <= 7; offset++) {
      const date = addBusinessDays(state.today, offset);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
      for (const slot of item.weeklySchedule.filter(
        (s) => s.weekday === weekday,
      )) {
        if (
          vietnamLessonTime(date, slot.time) <= Date.parse(now) ||
          state.lessons.some(
            (l) =>
              l.classId === item.id &&
              l.sessionDate === date &&
              l.startTime === slot.time,
          )
        )
          continue;
        recurring.push({
          id: item.id,
          kind: "recurring",
          name: item.displayName,
          date,
          time: slot.time,
        });
      }
    }
  }
  return {
    today: state.today,
    through,
    items: sortUpcomingLessons([...items.values()]),
    recurring: sortUpcomingLessons(recurring),
  };
}

function publicShare(
  state: DemoWorkspace,
  raw: unknown,
  now: string,
): PublicStatement {
  const { token } = z.object({ token: shareTokenSchema }).strict().parse(raw);
  const key = hash(token).digest("hex");
  const link = state.shares.get(key);
  if (!link || link.expiresAt <= now)
    throw new AppError(404, "Không tìm thấy dữ liệu.");
  const statement = find(state.statements, link.statementId);
  if (
    statement.status !== "issued" ||
    statement.activeShareTokenHash !== key ||
    !statement.number ||
    !statement.issueDate
  )
    throw new AppError(404, "Không tìm thấy dữ liệu.");
  const reference = transferReference(statement);
  return {
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
    payments: activePayments(state, statement.id).map(
      ({ receivedDate, amountVnd }) => ({ receivedDate, amountVnd }),
    ),
    bankDetails: statement.bankSnapshot,
    ...(statement.bankTransferSnapshot
      ? { bankTransfer: statement.bankTransferSnapshot }
      : {}),
    ...(reference ? { transferReference: reference } : {}),
    updatedAt: statement.updatedAt,
  };
}

function read(
  state: DemoWorkspace,
  path: string[],
  query: URLSearchParams,
  at: string,
): unknown {
  const [resource, id, action] = path;
  const archived = query.get("archived") ?? "false";
  const term = normalizeSearch(query.get("q") ?? "");
  const matches = (name: string, archivedAt: string | null) =>
    (archived === "all" || Boolean(archivedAt) === (archived === "true")) &&
    normalizeSearch(name).includes(term);
  if (resource === "summary") return summary(state);
  if (resource === "onboarding") return demoOnboarding(state);
  if (resource === "profile") return state.profile;
  if (resource === "appearance")
    return { theme: state.theme, schemaVersion: 1 };
  if (resource === "bank-shortcut") return null;
  if (resource === "mobile" && id === "schedule") return schedule(state, at);
  if (resource === "students")
    return id
      ? find(state.students, id)
      : page(
          state.students
            .filter((s) => matches(s.displayName, s.archivedAt))
            .sort((a, b) =>
              archived === "true"
                ? compare(b.archivedAt ?? "", a.archivedAt ?? "") ||
                  compare(b.id, a.id)
                : compare(a.displayName, b.displayName) || compare(a.id, b.id),
            ),
          query,
        );
  if (resource === "classes") {
    if (id) {
      const item = find(state.classes, id);
      return {
        ...item,
        students: item.studentIds.map((sid) => find(state.students, sid)),
      };
    }
    return page(
      state.classes
        .filter((c) => matches(c.displayName, c.archivedAt))
        .sort(
          (a, b) =>
            compare(a.displayName, b.displayName) || compare(a.id, b.id),
        ),
      query,
    );
  }
  if (resource === "sessions") {
    const eq = (param: string, value?: string | null) =>
      !query.has(param) || query.get(param) === value;
    return id
      ? find(state.sessions, id)
      : page(
          state.sessions
            .filter(
              (s) =>
                eq("studentId", s.studentId) &&
                eq("classId", s.classId) &&
                eq("lessonId", s.lessonId) &&
                s.sessionDate >= (query.get("from") ?? "") &&
                s.sessionDate <= (query.get("to") ?? "9999") &&
                matchesSession(
                  s,
                  query.get("status") ?? "all",
                  query.get("billing") ?? "all",
                  query.get("type") ?? "all",
                ),
            )
            .sort((a, b) => oldest(b, a)),
          query,
        );
  }
  if (resource === "lessons") {
    if (id) {
      const item = find(state.lessons, id);
      return {
        ...item,
        sessions: item.sessionIds.map((sid) => find(state.sessions, sid)),
      };
    }
    return page(
      state.lessons
        .filter(
          (l) =>
            (!query.has("classId") || l.classId === query.get("classId")) &&
            (query.get("type") !== "group" || !l.classId),
        )
        .sort(
          (a, b) =>
            compare(b.sessionDate, a.sessionDate) || compare(b.id, a.id),
        ),
      query,
    );
  }
  if (resource === "statements") {
    if (id === "eligible")
      return page(
        state.sessions
          .filter((s) =>
            canBill(
              s,
              query.get("studentId") ?? "",
              query.get("periodStart") ?? "",
              query.get("periodEnd") ?? "",
              query.get("statementId"),
            ),
          )
          .sort(oldest),
        query,
        50,
      );
    if (!id) {
      const dateRange = statementDateRangeSchema.parse({
        from: query.get("from") ?? undefined,
        to: query.get("to") ?? undefined,
      });
      return page(
        state.statements
          .filter(
            (s) =>
              (!query.has("studentId") ||
                s.studentId === query.get("studentId")) &&
              matchesStatement(s, query.get("status") ?? "all", state.today) &&
              matchesStatementDate(s, dateRange),
          )
          .sort(
            (a, b) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id),
          ),
        query,
      );
    }
    const statement = find(state.statements, id);
    if (action === "payments")
      return page(
        state.payments
          .filter((p) => p.statementId === id)
          .sort(
            (a, b) =>
              compare(b.receivedDate, a.receivedDate) || compare(b.id, a.id),
          ),
        query,
      );
    if (action === "share") {
      const link = state.shares.get(statement.activeShareTokenHash ?? "");
      const expiresAt = link && link.expiresAt > at ? link.expiresAt : null;
      return { active: !!expiresAt, expiresAt };
    }
    return { ...statement, transferReference: transferReference(statement) };
  }
  if (resource === "exports" && state.exports.has(id)) {
    const { dataset } = exportPageInputSchema.parse(Object.fromEntries(query));
    const records: Record<string, unknown>[] =
      dataset === "profile"
        ? [state.profile]
        : dataset === "appearance"
          ? [{ theme: state.theme, schemaVersion: 1 }]
          : dataset === "statementItems"
            ? state.statements.flatMap((s) =>
                s.items.map((item) => ({ statementId: s.id, ...item })),
              )
            : dataset === "auditEvents"
              ? []
              : state[dataset];
    const keys = Object.keys(records[0] ?? {});
    const result = page(records, query);
    return {
      records: result.items,
      nextCursor: result.nextCursor,
      exportedAt: at,
      csv:
        (query.has("cursor") ? "" : csvLine(keys)) +
        result.items
          .map((row) => csvLine(keys.map((key) => row[key])))
          .join(""),
    };
  }
  throw new AppError(404, "Không tìm thấy chức năng.");
}

function recordLesson(state: DemoWorkspace, command: DemoCommand, id?: string) {
  const { status, billable, ...details } = lessonInputSchema.parse(
    command.body,
  );
  const current = id ? find(state.lessons, id) : null;
  const classRecord = details.classId
    ? find(state.classes, details.classId)
    : null;
  const students = details.studentIds.map((sid) => find(state.students, sid));
  const prior = current?.sessionIds.map((sid) => find(state.sessions, sid));
  if (prior?.some((s) => s.billedStatementId))
    throw new AppError(409, "Buổi đã lập bảng kê không thể sửa.");
  if (
    current &&
    (current.classId !== details.classId ||
      current.studentIds.join() !== details.studentIds.join())
  )
    throw new AppError(
      409,
      "Danh sách tham gia của buổi đã lưu được giữ cố định. Có thể hủy hoặc miễn phí riêng từng học viên.",
    );
  if (
    !current &&
    (students.some((s) => s.archivedAt) || classRecord?.archivedAt)
  )
    throw new AppError(409, "Khôi phục lớp trước khi ghi buổi mới.");
  const lesson: GroupLesson = {
    ...details,
    id: id ?? command.id,
    className: current?.className ?? classRecord?.displayName ?? null,
    sessionIds: details.studentIds.map(
      (_, index) => prior?.[index]?.id ?? `${command.id}-${index}`,
    ),
    createdAt: current?.createdAt ?? command.at,
    updatedAt: command.at,
    schemaVersion: 1,
  };
  students.forEach((student, index) => {
    const old = prior?.[index];
    const tuition = {
      status: status ?? old?.status ?? "completed",
      billable: billable ?? old?.billable ?? true,
      rateVnd: details.rateVnd,
    };
    store(state.sessions, {
      ...tuition,
      id: lesson.sessionIds[index],
      studentId: student.id,
      studentName: old?.studentName ?? student.displayName,
      lessonId: lesson.id,
      classId: lesson.classId,
      className: lesson.className,
      sessionDate: lesson.sessionDate,
      startTime: lesson.startTime,
      durationMinutes: lesson.durationMinutes,
      amountVnd: sessionAmount(tuition),
      billedStatementId: null,
      privateNote: old?.privateNote ?? "",
      requestId: old?.requestId ?? command.id,
      createdAt: old?.createdAt ?? command.at,
      updatedAt: command.at,
      schemaVersion: 1,
    });
  });
  return store(state.lessons, lesson);
}

function issue(
  state: DemoWorkspace,
  command: DemoCommand,
  previous?: Statement,
  edit = false,
) {
  const raw = command.body;
  const input = statementDraftInputSchema.parse(raw);
  if (previous) {
    assertVersion(previous, input.version);
    if (
      edit
        ? previous.status !== "issued" || previous.paidVnd > 0
        : previous.status !== "draft"
    )
      throw new AppError(409, "Bảng kê đã thay đổi. Hãy tải lại.");
  }
  const student = find(state.students, input.studentId);
  if (edit && previous?.studentId !== student.id)
    throw new AppError(400, "Không thể đổi học viên của bảng kê đã phát hành.");
  const items = input.sessionIds
    .map((id) => find(state.sessions, id))
    .sort(oldest);
  if (
    items.some(
      (s) =>
        !canBill(
          s,
          student.id,
          input.periodStart,
          input.periodEnd,
          edit ? previous!.id : null,
        ),
    )
  )
    throw new AppError(409, "Một số buổi đã thay đổi. Hãy chọn lại.");
  const issued = edit || /\/(?:issue|publish)$/.test(command.path);
  const issueDate =
    previous?.issueDate ?? (issued ? vietnamToday(new Date(command.at)) : null);
  const id = previous?.id ?? command.id;
  const seq = state.statements.filter((s) => s.number).length + 2;
  const record: Statement = {
    id,
    studentId: student.id,
    status: issued ? "issued" : "draft",
    number:
      previous?.number ??
      (issueDate
        ? `CC-${issueDate.slice(0, 4)}-${String(seq).padStart(6, "0")}`
        : null),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    issueDate,
    dueDate: input.dueDate,
    teacherSnapshot: previous?.teacherSnapshot ?? {
      displayName: state.profile.displayName,
    },
    recipientSnapshot: { displayName: student.displayName },
    bankSnapshot: previous?.bankSnapshot ?? null,
    bankTransferSnapshot: edit
      ? previous!.bankTransferSnapshot
      : state.profile.bankTransfer,
    includeBankDetails: edit
      ? previous!.includeBankDetails
      : Boolean(state.profile.bankTransfer),
    items: items.map((s) => ({
      sessionId: s.id,
      sessionDate: s.sessionDate,
      amountVnd: s.amountVnd,
    })),
    totalVnd: statementTotal(items),
    paidVnd: 0,
    activePaymentCount: 0,
    activeShareTokenHash: previous?.activeShareTokenHash ?? null,
    version: (previous?.version ?? 0) + 1,
    issuedAt: previous?.issuedAt ?? (issued ? command.at : null),
    voidedAt: null,
    voidReason: null,
    createdAt: previous?.createdAt ?? command.at,
    updatedAt: command.at,
    schemaVersion: 1,
  };
  if (issued) {
    if (edit)
      state.sessions.forEach((s) => {
        if (s.billedStatementId === id) s.billedStatementId = null;
      });
    items.forEach((s) => {
      s.billedStatementId = id;
    });
  }
  return store(state.statements, record);
}

function changePayment(
  state: DemoWorkspace,
  command: DemoCommand,
  statement: Statement,
  payment?: Payment,
  remove = false,
) {
  if (statement.status !== "issued" || payment?.voidedAt)
    throw new AppError(
      409,
      "Khoản thu không còn hợp lệ hoặc không khớp bảng kê.",
    );
  let record: Payment;
  if (remove && payment) {
    const { reason } = paymentVoidInputSchema.parse(command.body);
    record = { ...payment, voidedAt: command.at, voidReason: reason };
  } else if (payment) {
    const { expectedUpdatedAt, ...input } = paymentEditInputSchema.parse(
      command.body,
    );
    if (expectedUpdatedAt !== (payment.updatedAt ?? null))
      throw new AppError(
        409,
        "Khoản thu đã thay đổi. Vui lòng tải lại để chỉnh sửa.",
      );
    record = { ...payment, ...input, updatedAt: command.at };
  } else {
    record = {
      ...paymentInputSchema.parse(command.body),
      id: command.id,
      statementId: statement.id,
      studentId: statement.studentId,
      recordedAt: command.at,
      requestId: command.id,
      schemaVersion: 1,
      voidedAt: null,
      voidReason: null,
    };
  }
  const paid =
    statement.paidVnd -
    (payment?.amountVnd ?? 0) +
    (remove ? 0 : record.amountVnd);
  if (paid > statement.totalVnd)
    throw new AppError(
      409,
      "Số tiền vượt khoản còn phải thu. Hãy tải lại bảng kê để đối chiếu.",
    );
  if (record.receivedDate > vietnamToday(new Date(command.at)))
    throw new AppError(400, "Ngày nhận tiền không được nằm trong tương lai.");
  statement.paidVnd = paid;
  statement.activePaymentCount += remove ? -1 : payment ? 0 : 1;
  statement.version++;
  statement.updatedAt = command.at;
  return store(state.payments, record);
}

export function executeDemoCommand(
  state: DemoWorkspace,
  command: DemoCommand,
): unknown {
  const { pathname, searchParams } = new URL(
    command.path,
    "https://demo.invalid",
  );
  const path = pathname.split("/").slice(2);
  const [resource, id, action] = path;
  if (command.method === "GET")
    return read(state, path, searchParams, command.at);
  if (resource === "share" && id === "resolve")
    return publicShare(state, command.body, command.at);
  const timestamps = {
    createdAt: command.at,
    updatedAt: command.at,
    schemaVersion: 1 as const,
  };
  if (resource === "students") {
    const old = id ? find(state.students, id) : null;
    if (action === "archive" && old) {
      const { archived } = z
        .object({ archived: z.boolean() })
        .strict()
        .parse(command.body);
      return store(state.students, {
        ...old,
        archivedAt: archived ? command.at : null,
        updatedAt: command.at,
      });
    }
    return store(state.students, {
      ...timestamps,
      archivedAt: null,
      ...old,
      ...studentInputSchema.parse(command.body),
      id: id ?? command.id,
      updatedAt: command.at,
    });
  }
  if (resource === "classes") {
    const old = id ? find(state.classes, id) : null;
    if (action === "archive" && old) {
      const { archived } = z
        .object({ archived: z.boolean() })
        .strict()
        .parse(command.body);
      return store(state.classes, {
        ...old,
        archivedAt: archived ? command.at : null,
        updatedAt: command.at,
      });
    }
    const input = classInputSchema.parse(command.body);
    input.studentIds.forEach((sid) => find(state.students, sid));
    return store(state.classes, {
      ...timestamps,
      archivedAt: null,
      ...old,
      ...input,
      weeklySchedule: input.weeklySchedule ?? old?.weeklySchedule ?? [],
      id: id ?? command.id,
      updatedAt: command.at,
    });
  }
  if (resource === "sessions") {
    const old = id ? find(state.sessions, id) : null;
    if (old?.billedStatementId)
      throw new AppError(409, "Buổi đã lập bảng kê không thể sửa.");
    const input = sessionInputSchema.parse(command.body);
    const student = find(state.students, input.studentId);
    if (old && input.studentId !== old.studentId)
      throw new AppError(400, "Không thể đổi học viên của buổi đã lưu.");
    if (!old && student.archivedAt)
      throw new AppError(409, "Khôi phục học viên trước khi thêm buổi mới.");
    const rateVnd = input.rateVnd ?? old?.rateVnd ?? student.defaultRateVnd;
    if (
      old?.lessonId &&
      (input.sessionDate !== old.sessionDate ||
        input.startTime !== old.startTime ||
        input.durationMinutes !== old.durationMinutes ||
        rateVnd !== old.rateVnd)
    )
      throw new AppError(
        409,
        "Sửa ngày, giờ, thời lượng và đơn giá chung tại trang buổi nhóm/lớp.",
      );
    return store(state.sessions, {
      ...timestamps,
      billedStatementId: null,
      requestId: command.id,
      ...old,
      ...input,
      id: id ?? command.id,
      studentName: student.displayName,
      rateVnd,
      amountVnd: sessionAmount({ ...input, rateVnd }),
      updatedAt: command.at,
    });
  }
  if (resource === "lessons") return recordLesson(state, command, id);
  if (resource === "statements") {
    if (!id || id === "issue") return issue(state, command);
    const statement = find(state.statements, id);
    if (!action && command.method === "PATCH")
      return issue(state, command, statement);
    if (action === "publish" || action === "issued")
      return issue(state, command, statement, action === "issued");
    if (action === "issue") {
      const { version } = statementIssueInputSchema.parse(command.body);
      return issue(
        state,
        {
          ...command,
          body: {
            version,
            studentId: statement.studentId,
            periodStart: statement.periodStart,
            periodEnd: statement.periodEnd,
            dueDate: statement.dueDate,
            sessionIds: statement.items.map((s) => s.sessionId),
          },
        },
        statement,
      );
    }
    if (action === "payments") return changePayment(state, command, statement);
    if (action === "void") {
      const { version, reason } = statementVoidInputSchema.parse(command.body);
      assertVersion(statement, version);
      if (statement.activePaymentCount)
        throw new AppError(
          409,
          "Khoản thu không còn hợp lệ hoặc không khớp bảng kê.",
        );
      for (const s of state.sessions)
        if (s.billedStatementId === id) s.billedStatementId = null;
      return store(state.statements, {
        ...statement,
        status: "void",
        activeShareTokenHash: null,
        version: version + 1,
        voidedAt: command.at,
        voidReason: reason,
        updatedAt: command.at,
      });
    }
    if (action === "share") {
      const { version } = shareCreateInputSchema.parse(command.body);
      assertVersion(statement, version);
      if (statement.status !== "issued")
        throw new AppError(409, "Chỉ chia sẻ bảng kê đã phát hành.");
      const token = hash(command.id).digest("base64url");
      const tokenHash = hash(token).digest("hex");
      const expiresAt = new Date(
        Date.parse(command.at) + 30 * 86400000,
      ).toISOString();
      state.shares.set(tokenHash, { statementId: id, expiresAt });
      statement.activeShareTokenHash = tokenHash;
      statement.version++;
      return { id, token, tokenHash, expiresAt };
    }
    if (action === "revoke-share") {
      const { version } = shareRevokeInputSchema.parse(command.body);
      assertVersion(statement, version);
      statement.activeShareTokenHash = null;
      statement.version++;
      return { id };
    }
  }
  if (resource === "payments") {
    const payment = find(state.payments, id);
    return changePayment(
      state,
      command,
      find(state.statements, payment.statementId),
      payment,
      action === "void",
    );
  }
  if (resource === "profile" && id === "bank-transfer") {
    const { bankTransfer } = z
      .object({ bankTransfer: bankTransferInputSchema.nullable() })
      .strict()
      .parse(command.body);
    state.profile.bankTransfer = bankTransfer
      ? {
          ...bankTransfer,
          bankName: vietQrBanks[bankTransfer.bankBin] ?? "Demo bank",
        }
      : null;
    return { id: "demo-profile" };
  }
  if (resource === "profile" || resource === "onboarding") {
    const { displayName } = teacherSettingsSchema.parse(command.body);
    state.profile.displayName = displayName;
    return { id: "demo-profile" };
  }
  if (resource === "appearance") {
    state.theme = appearanceInputSchema.parse(command.body).theme;
    return { id: "demo-appearance" };
  }
  if (resource === "exports") {
    exportInputSchema.parse(command.body);
    state.exports.add(command.id);
    return { id: command.id };
  }
  throw new AppError(404, "Không tìm thấy chức năng.");
}
