import { z } from "zod";
import { idSchema } from ".";
export const DATASETS = [
  "profile",
  "students",
  "classes",
  "lessons",
  "appearance",
  "sessions",
  "statements",
  "statementItems",
  "payments",
  "auditEvents",
] as const;
export const datasetSchema = z.enum(DATASETS);
export type Dataset = z.infer<typeof datasetSchema>;
export const datasetLabels: Record<Dataset, string> = {
  profile: "Hồ sơ giáo viên",
  students: "Học viên",
  classes: "Lớp học",
  lessons: "Buổi nhóm và lớp",
  appearance: "Giao diện",
  sessions: "Buổi dạy",
  statements: "Bảng kê",
  statementItems: "Chi tiết bảng kê",
  payments: "Khoản thu",
  auditEvents: "Lịch sử thao tác",
};
export const exportInputSchema = z
  .object({ dataset: z.union([datasetSchema, z.literal("all")]) })
  .strict();
export const exportPageInputSchema = z
  .object({
    dataset: datasetSchema,
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();
export type ExportPage = {
  csv: string;
  records: Record<string, unknown>[];
  nextCursor: string | null;
  exportedAt: string;
};
export const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;
export const DELETE_CONFIRMATION = "XÓA TÀI KHOẢN";
export const deletionInputSchema = z
  .object({
    confirmation: z.enum([DELETE_CONFIRMATION, "DELETE ACCOUNT"]),
    acknowledged: z.literal(true),
    idToken: z.string().min(1).max(12000),
  })
  .strict();
export const deletionPhases = [
  "revoke",
  "shares",
  "data",
  "auth",
  "done",
] as const;
export type DeletionPhase = (typeof deletionPhases)[number];
export type DeletionStatus = {
  phase: DeletionPhase;
  busy: boolean;
  completedAt: string | null;
};
export const deletionLabels: Record<DeletionPhase, string> = {
  revoke: "Thu hồi các phiên đăng nhập",
  shares: "Xóa link chia sẻ",
  data: "Xóa học viên, buổi dạy và sổ học phí",
  auth: "Xóa tài khoản đăng nhập",
  done: "Đã xóa tài khoản",
};
