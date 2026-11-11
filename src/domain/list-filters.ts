import { z } from "zod";
import type { TeachingSession } from ".";
import type { Statement } from "./statements";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
export const searchSchema = z
  .string()
  .trim()
  .max(100, "Tìm kiếm tối đa 100 ký tự.")
  .default("")
  .transform(normalizeSearch);
export const sessionStatusFilterSchema = z.enum([
  "all",
  "planned",
  "completed",
  "cancelled",
]);
export const billingFilterSchema = z.enum([
  "all",
  "unbilled",
  "billed",
  "free",
]);
export const sessionTypeFilterSchema = z.enum([
  "all",
  "individual",
  "group",
  "class",
  "shared",
]);
export const sessionTypeLabels = {
  all: "Tất cả",
  individual: "Buổi cá nhân",
  group: "Buổi nhóm tự chọn",
  class: "Buổi của lớp",
  shared: "Buổi nhóm & lớp",
} as const satisfies Record<z.infer<typeof sessionTypeFilterSchema>, string>;
export function matchesSession(
  session: TeachingSession,
  status: string,
  billing: string,
  type = "all",
) {
  const sessionType = session.classId
    ? "class"
    : session.lessonId
      ? "group"
      : "individual";
  if (
    type === "shared"
      ? sessionType === "individual"
      : type !== "all" && sessionType !== type
  )
    return false;
  if (status !== "all" && session.status !== status) return false;
  if (billing === "unbilled")
    return (
      session.status === "completed" &&
      session.billable &&
      session.billedStatementId === null
    );
  if (billing === "billed") return session.billedStatementId !== null;
  if (billing === "free")
    return session.status === "completed" && !session.billable;
  return true;
}
export const statementFilterSchema = z.enum([
  "all",
  "draft",
  "issued",
  "void",
  "outstanding",
  "unpaid",
  "partial",
  "paid",
  "overdue",
]);
export const statementFilterLabels = {
  all: "Tất cả trạng thái",
  draft: "Nháp",
  issued: "Đã phát hành",
  void: "Đã hủy",
  outstanding: "Còn thiếu",
  unpaid: "Chưa thu",
  partial: "Thu một phần",
  paid: "Đã thu đủ",
  overdue: "Quá hạn",
} as const;
export function storedStatementStatus(filter: string) {
  return ["all", "draft", "issued", "void"].includes(filter)
    ? filter
    : "issued";
}
export function matchesStatement(
  statement: Statement,
  filter: string,
  today: string,
) {
  if (filter === "all") return true;
  if (["draft", "issued", "void"].includes(filter))
    return statement.status === filter;
  if (statement.status !== "issued") return false;
  if (filter === "unpaid") return statement.paidVnd === 0;
  if (filter === "partial")
    return statement.paidVnd > 0 && statement.paidVnd < statement.totalVnd;
  if (filter === "paid") return statement.paidVnd === statement.totalVnd;
  return (
    statement.paidVnd < statement.totalVnd &&
    (filter !== "overdue" || today > statement.dueDate)
  );
}
