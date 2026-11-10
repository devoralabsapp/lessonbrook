import { z } from "zod";

export const TIME_ZONE = "Asia/Ho_Chi_Minh";
export const MAX_VND = 1_000_000_000;
export const moneySchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_VND)
  .refine(Number.isSafeInteger, "Số tiền phải là số nguyên VND an toàn");
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "ID không hợp lệ");
export const requestIdSchema = z.uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      value >= "1900-01-01" &&
      value <= "2100-12-31" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Ngày không hợp lệ (YYYY-MM-DD)");
const text = (max: number) => z.string().trim().max(max);
export const profileSchema = z
  .object({
    displayName: text(100).min(1),
    email: z.email().nullable(),
    currency: z.literal("VND"),
    timeZone: z.literal(TIME_ZONE),
    bankDetails: text(500),
    schemaVersion: z.literal(1),
  })
  .strict();
export const studentInputSchema = z
  .object({
    displayName: text(100).min(1, "Vui lòng nhập tên học viên"),
    contactName: text(100).default(""),
    phone: text(30).default(""),
    privateNote: text(1000).default(""),
    defaultRateVnd: moneySchema,
  })
  .strict();
export const sessionInputSchema = z
  .object({
    studentId: idSchema,
    sessionDate: dateSchema,
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
    durationMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    status: z.enum(["planned", "completed", "cancelled"]),
    billable: z.boolean(),
    rateVnd: moneySchema.optional(),
    privateNote: text(1000).default(""),
  })
  .strict()
  .refine((s) => s.status !== "cancelled" || !s.billable, {
    message: "Buổi đã hủy phải là buổi miễn phí",
    path: ["billable"],
  });
export const studentSchema = studentInputSchema.extend({
  id: idSchema,
  archivedAt: z.string().nullable(),
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const sessionSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  studentName: text(100),
  sessionDate: dateSchema,
  startTime: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  status: z.enum(["planned", "completed", "cancelled"]),
  billable: z.boolean(),
  rateVnd: moneySchema,
  amountVnd: moneySchema,
  privateNote: text(1000),
  billedStatementId: idSchema.nullable(),
  requestId: requestIdSchema,
  lessonId: idSchema.nullable().optional(),
  classId: idSchema.nullable().optional(),
  className: text(100).nullable().optional(),
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudentInput = z.infer<typeof studentInputSchema>;
export type Student = z.infer<typeof studentSchema>;
export type SessionInput = z.infer<typeof sessionInputSchema>;
export type TeachingSession = z.infer<typeof sessionSchema>;
export function sessionAmount(
  session: Pick<TeachingSession, "status" | "billable" | "rateVnd">,
) {
  return session.status === "completed" && session.billable
    ? moneySchema.parse(session.rateVnd)
    : 0;
}
export function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function formatVnd(value: number, locale: "en" | "vi" = "vi") {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
export const statusLabels = {
  planned: "Dự kiến",
  completed: "Đã dạy",
  cancelled: "Đã hủy",
};
