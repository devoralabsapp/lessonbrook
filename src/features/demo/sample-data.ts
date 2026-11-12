import "server-only";
import {
  sessionAmount,
  TIME_ZONE,
  type Student,
  type TeachingSession,
} from "@/domain";
import { addBusinessDays, type Statement } from "@/domain/statements";
import { type GroupLesson, type TeachingClass } from "@/domain/classes";
import { DEFAULT_THEME, type Theme } from "@/domain/appearance";
import type { BankTransfer } from "@/domain/bank-transfer";
import type { Payment } from "@/domain/payments";

export const demoTeacherName = "Demo Teacher";
const demoBank: BankTransfer = {
  bankBin: "970436",
  bankName: "Vietcombank",
  accountNumber: "0000000000",
  accountName: "LESSONBROOK DEMO",
};

const names = [
  "Alex Rivera",
  "Bảo An",
  "Camila Reed",
  "Chi Mai",
  "Đức Long",
  "Emma Brooks",
  "Gia Bảo",
  "Hà Linh",
  "Isabel Park",
  "Jamie Flores",
  "Khánh Vy",
  "Lam Anh",
  "Leo Chen",
  "Mai Anh",
  "Minh Khang",
  "Naomi Cruz",
  "Nhi Phan",
  "Noah Silva",
  "Olivia Nguyen",
  "Phúc An",
  "Quỳnh Anh",
  "Riley Kim",
  "Sofia Tran",
  "Tâm An",
  "Thanh Bình",
  "Thiên Ân",
  "Tú Anh",
  "Valerie Shaw",
  "Vân Anh",
  "Yến Chi",
  "An Nhiên",
  "Bình Minh",
  "Carter Green",
  "Daisy Wong",
  "Eli Brown",
  "Hải Đăng",
  "Hana Martin",
  "Jade Lin",
  "Kiều Oanh",
  "Luca Rossi",
  "My Linh",
  "Ngọc Minh",
  "Sam Wilson",
  "Trúc Anh",
  "Zoe Patel",
];

const classNames = [
  "Piano cơ bản",
  "Piano nâng cao",
  "Tiếng Anh giao tiếp",
  "Tiếng Anh thiếu nhi",
  "Toán lớp 6",
  "Toán lớp 9",
  "Guitar acoustic",
  "Nhạc lý",
  "Luyện phát âm",
  "Viết sáng tạo",
];

const paymentStates = [
  "paid",
  "partial",
  "unpaid",
  "overdue",
  "draft",
  "paid",
  "partial",
  "unpaid",
  "overdue",
  "void",
  "paid",
  "partial",
  "unpaid",
  "paid",
  "paid",
] as const;

function createDemoData(today: string) {
  const students = names.map((name, index) => ({
    id: index + 1,
    name,
    archived: index >= 43,
  }));
  const classes = classNames.map((name, index) => ({
    id: index + 1,
    name,
    students: students.filter(
      (_, studentIndex) => studentIndex % classNames.length === index,
    ),
    archived: index === 9,
    schedule:
      index === 9
        ? []
        : [
            {
              weekday: (index % 7) + 1,
              time: index % 2 === 0 ? "18:00" : "19:30",
            },
            ...(index % 3 === 0
              ? [{ weekday: ((index + 2) % 7) + 1, time: "18:00" }]
              : []),
          ],
  }));
  const lessons = Array.from({ length: 30 }, (_, index) => {
    const teachingClass = classes[index < 10 ? index : index % 9];
    const type =
      index < 10 || (index >= 24 && index <= 25)
        ? "class"
        : index < 15
          ? "group"
          : "individual";
    const participants =
      type === "class"
        ? teachingClass.students
        : type === "group"
          ? [students[index], students[index + 10], students[index + 20]]
          : [students[index - 15]];
    const status =
      index >= 26 ? "cancelled" : index >= 23 ? "planned" : "completed";
    return {
      id: index + 1,
      type,
      className: type === "class" ? teachingClass.name : null,
      students: participants,
      date: addBusinessDays(
        today,
        status === "planned" ? index - 22 : -Math.min(index + 1, 20),
      ),
      time: index % 2 ? "19:30" : "18:00",
      durationMinutes: index % 3 ? 60 : 45,
      status,
      rate:
        status === "completed" && index < 20 ? 150000 + (index % 4) * 50000 : 0,
    } as const;
  });
  const statements = paymentStates.map((status, index) => {
    const lesson = lessons[index];
    const student = lesson.students[0];
    const items = index < 5 ? [lesson, lessons[15 + index]] : [lesson];
    const total = items.reduce((sum, item) => sum + item.rate, 0);
    const amount =
      status === "paid" ? total : status === "partial" ? total / 2 : 0;
    const payments = amount
      ? [
          {
            amount: index === 0 ? amount / 2 : amount,
            date: addBusinessDays(today, -1),
            method: index % 2 ? "cash" : "transfer",
          },
          ...(index === 0
            ? [{ amount: amount / 2, date: today, method: "cash" }]
            : []),
        ]
      : [];
    return {
      status,
      student,
      items,
      total,
      paid: amount,
      due: addBusinessDays(today, status === "overdue" ? -2 : 5),
      payments,
    };
  });
  return { students, classes, lessons, statements };
}

export function createDemoWorkspace(today: string) {
  const sample = createDemoData(today);
  const now = `${today}T00:00:00.000Z`;
  const timestamps = {
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1 as const,
  };
  const students: Student[] = sample.students.map((student, index) => ({
    ...timestamps,
    id: `student-${student.id}`,
    displayName: student.name,
    contactName: index % 3 ? "" : "Demo guardian",
    phone: "",
    privateNote: "",
    defaultRateVnd: 150000 + (index % 4) * 50000,
    archivedAt: student.archived ? now : null,
  }));
  const classes: TeachingClass[] = sample.classes.map((item, index) => ({
    ...timestamps,
    id: `class-${item.id}`,
    displayName: item.name,
    studentIds: item.students.map(({ id }) => `student-${id}`),
    weeklySchedule: item.schedule,
    privateNote: "",
    archivedAt: item.archived ? now : null,
    rateVnd: 150000 + (index % 4) * 50000,
  }));
  const sessions: TeachingSession[] = [];
  const lessons: GroupLesson[] = [];
  for (const lesson of sample.lessons) {
    const classId =
      classes.find((item) => item.displayName === lesson.className)?.id ?? null;
    const groupId = lesson.type === "individual" ? null : `lesson-${lesson.id}`;
    const shared = {
      ...timestamps,
      classId,
      className: lesson.className,
      sessionDate: lesson.date,
      startTime: lesson.time,
      durationMinutes: lesson.durationMinutes,
      privateNote: "",
      rateVnd: lesson.rate || 200000,
    };
    const members = lesson.students.map((student) => {
      const details = {
        status: lesson.status,
        billable: lesson.status === "planned" || lesson.rate > 0,
        rateVnd: shared.rateVnd,
      };
      const session: TeachingSession = {
        ...shared,
        ...details,
        id: `session-${lesson.id}-${student.id}`,
        lessonId: groupId,
        studentId: `student-${student.id}`,
        studentName: student.name,
        amountVnd: sessionAmount(details),
        billedStatementId: null,
        requestId: "00000000-0000-4000-8000-000000000000",
      };
      sessions.push(session);
      return session;
    });
    if (groupId)
      lessons.push({
        ...shared,
        id: groupId,
        studentIds: members.map((member) => member.studentId),
        sessionIds: members.map((member) => member.id),
      });
  }
  const payments: Payment[] = [];
  const statements: Statement[] = sample.statements.map((statement, index) => {
    const id = `statement-${index + 1}`;
    const studentId = `student-${statement.student.id}`;
    const status =
      statement.status === "draft" || statement.status === "void"
        ? statement.status
        : "issued";
    const items = statement.items
      .map((lesson) => {
        const row = sessions.find(
          (s) => s.id === `session-${lesson.id}-${statement.student.id}`,
        )!;
        if (status === "issued") row.billedStatementId = id;
        return {
          sessionId: row.id,
          sessionDate: row.sessionDate,
          amountVnd: row.amountVnd,
        };
      })
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
    for (const [position, payment] of statement.payments.entries()) {
      payments.push({
        id: `payment-${index + 1}-${position + 1}`,
        statementId: id,
        studentId,
        amountVnd: payment.amount,
        receivedDate: payment.date,
        method: payment.method === "cash" ? "cash" : "transfer",
        privateNote: "",
        recordedAt: new Date(
          `${payment.date}T${position ? "10:35:42" : "09:20:15"}+07:00`,
        ).toISOString(),
        voidedAt: null,
        voidReason: null,
        requestId: "00000000-0000-4000-8000-000000000000",
        schemaVersion: 1,
      });
    }
    return {
      ...timestamps,
      id,
      studentId,
      status,
      number:
        status === "draft"
          ? null
          : `CC-${today.slice(0, 4)}-${String(index + 1).padStart(6, "0")}`,
      periodStart: items[0].sessionDate,
      periodEnd: items.at(-1)!.sessionDate,
      issueDate:
        status === "draft" ? null : items[items.length - 1].sessionDate,
      dueDate: statement.due,
      teacherSnapshot: { displayName: demoTeacherName },
      recipientSnapshot: { displayName: statement.student.name },
      bankSnapshot: null,
      bankTransferSnapshot: demoBank,
      includeBankDetails: true,
      items,
      totalVnd: statement.total,
      paidVnd: statement.paid,
      activePaymentCount: statement.payments.length,
      activeShareTokenHash: null,
      version: 1,
      issuedAt: status === "draft" ? null : now,
      voidedAt: status === "void" ? now : null,
      voidReason: status === "void" ? "Demo cancellation" : null,
    };
  });
  return {
    today,
    students,
    sessions,
    lessons,
    classes,
    statements,
    payments,
    profile: {
      displayName: demoTeacherName,
      email: "teacher@example.test",
      currency: "VND",
      timeZone: TIME_ZONE,
      schemaVersion: 1,
      bankDetails: "",
      bankTransfer: demoBank as BankTransfer | null,
    },
    theme: DEFAULT_THEME as Theme,
    exports: new Set<string>(),
    shares: new Map<string, { statementId: string; expiresAt: string }>(),
  };
}

export type DemoWorkspace = ReturnType<typeof createDemoWorkspace>;
