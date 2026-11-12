import { z } from "zod";
import { dateSchema, idSchema, MAX_VND, moneySchema } from ".";
import { bankTransferSchema } from "./bank-transfer";

export const MAX_STATEMENT_SESSIONS = 100;
export const statementMoneySchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_VND * MAX_STATEMENT_SESSIONS)
  .refine(Number.isSafeInteger);
export const statementVersionSchema = z.number().int().min(1).max(1_000_000);
export const statementDraftInputSchema = z
  .object({
    studentId: idSchema,
    periodStart: dateSchema,
    periodEnd: dateSchema,
    dueDate: dateSchema,
    sessionIds: z
      .array(idSchema)
      .min(1, "Chọn ít nhất một buổi dạy.")
      .max(
        MAX_STATEMENT_SESSIONS,
        "Mỗi bảng kê tối đa 100 buổi. Hãy chia thành nhiều bảng kê.",
      )
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Mỗi buổi chỉ được chọn một lần.",
      ),
    includeBankDetails: z.boolean().default(false),
    version: statementVersionSchema.optional(),
  })
  .strict()
  .refine(
    (input) => input.periodStart <= input.periodEnd,
    "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
  );
export const statementIssueInputSchema = z
  .object({ version: statementVersionSchema })
  .strict();
export const statementVoidInputSchema = z
  .object({
    version: statementVersionSchema,
    reason: z.string().trim().min(1, "Nhập lý do hủy bảng kê.").max(500),
  })
  .strict();
export const statementItemSchema = z
  .object({
    sessionId: idSchema,
    sessionDate: dateSchema,
    amountVnd: moneySchema,
  })
  .strict();
const snapshotSchema = z
  .object({ displayName: z.string().trim().min(1).max(100) })
  .strict();
export const statementSchema = z
  .object({
    id: idSchema,
    studentId: idSchema,
    status: z.enum(["draft", "issued", "void"]),
    number: z
      .string()
      .regex(/^CC-\d{4}-\d{6,10}$/)
      .nullable(),
    periodStart: dateSchema,
    periodEnd: dateSchema,
    issueDate: dateSchema.nullable(),
    dueDate: dateSchema,
    teacherSnapshot: snapshotSchema,
    recipientSnapshot: snapshotSchema,
    bankSnapshot: z.string().max(500).nullable(),
    bankTransferSnapshot: bankTransferSchema.nullable().optional(),
    includeBankDetails: z.boolean(),
    items: z.array(statementItemSchema).min(1).max(MAX_STATEMENT_SESSIONS),
    totalVnd: statementMoneySchema,
    paidVnd: statementMoneySchema,
    activePaymentCount: z.number().int().nonnegative().max(1_000_000),
    activeShareTokenHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    version: statementVersionSchema,
    issuedAt: z.string().nullable(),
    voidedAt: z.string().nullable(),
    voidReason: z.string().max(500).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    schemaVersion: z.literal(1),
  })
  .strict();
export type Statement = z.infer<typeof statementSchema>;
export type StatementDraftInput = z.infer<typeof statementDraftInputSchema>;
export function statementTotal(items: { amountVnd: number }[]) {
  return statementMoneySchema.parse(
    items.reduce(
      (total, item) =>
        statementMoneySchema.parse(total + moneySchema.parse(item.amountVnd)),
      0,
    ),
  );
}
export function periodBounds(period: "week" | "month", today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  if (period === "week") {
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    return {
      start: addBusinessDays(today, -daysFromMonday),
      end: addBusinessDays(today, 6 - daysFromMonday),
    };
  }
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return {
    start: today.slice(0, 8) + "01",
    end: date.toISOString().slice(0, 10),
  };
}

export function addBusinessDays(date: string, days: number) {
  dateSchema.parse(date);
  if (!Number.isSafeInteger(days)) throw new Error("Số ngày không hợp lệ.");
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateSchema.parse(value.toISOString().slice(0, 10));
}
export function statementDisplayStatus(
  statement: Pick<Statement, "status" | "totalVnd" | "paidVnd" | "dueDate">,
  today: string,
) {
  const label =
    statement.status === "draft"
      ? "Nháp"
      : statement.status === "void"
        ? "Đã hủy"
        : statement.paidVnd === statement.totalVnd
          ? "Đã thu đủ"
          : statement.paidVnd > 0
            ? "Thu một phần"
            : "Chưa thu";
  return {
    label,
    overdue:
      statement.status === "issued" &&
      statement.paidVnd < statement.totalVnd &&
      today > statement.dueDate,
  };
}
