import "server-only";
import { translator, type Locale, type Translator } from "@/lib/i18n/core";
import { randomUUID } from "node:crypto";
import {
  FieldPath,
  Timestamp,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import { idSchema, profileSchema } from "@/domain";
import {
  profileDocumentSchema,
  appearanceDocumentSchema,
} from "@/domain/firestore";
import { csvLine } from "@/domain/csv";
import {
  exportInputSchema,
  exportPageInputSchema,
  type Dataset,
  type ExportPage,
} from "@/domain/data";
import { AppError } from "./errors";
import { assertAccountAvailable } from "./account-access";
import { dto, operation, studentDto, sessionDto, userRef } from "./repository";
import { statementDto } from "./statements-repository";
import { paymentDto } from "./payments-repository";
import { classDto, lessonDto } from "./classes-repository";
import { appearanceSchema } from "@/domain/appearance";
const jobSchema = z
  .object({
    dataset: exportInputSchema.shape.dataset,
    readTime: z.instanceof(Timestamp),
    createdAt: z.instanceof(Timestamp),
    expiresAt: z.instanceof(Timestamp),
    schemaVersion: z.literal(1),
  })
  .strict();
const columns: Record<Dataset, [string, string][]> = {
  classes: [
    ["id", "Mã lớp"],
    ["displayName", "Tên lớp"],
    ["studentIds", "Mã các học viên"],
    ["rateVnd", "Học phí mỗi người VND"],
    ["privateNote", "Ghi chú riêng"],
    ["archivedAt", "Lưu trữ UTC"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  lessons: [
    ["id", "Mã buổi nhóm"],
    ["classId", "Mã lớp"],
    ["className", "Tên lớp đã lưu"],
    ["studentIds", "Mã các học viên"],
    ["sessionIds", "Mã các dòng học phí"],
    ["sessionDate", "Ngày buổi"],
    ["startTime", "Giờ bắt đầu"],
    ["durationMinutes", "Thời lượng phút"],
    ["rateVnd", "Đơn giá mỗi người VND"],
    ["privateNote", "Ghi chú riêng"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  appearance: [
    ["theme", "Giao diện"],
    ["schemaVersion", "Phiên bản dữ liệu"],
  ],
  profile: [
    ["displayName", "Tên giáo viên"],
    ["email", "Email"],
    ["bankDetails", "Thông tin nhận tiền"],
    ["currency", "Tiền tệ"],
    ["timeZone", "Múi giờ"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  students: [
    ["id", "Mã học viên"],
    ["displayName", "Tên học viên"],
    ["contactName", "Người liên hệ"],
    ["phone", "Điện thoại"],
    ["defaultRateVnd", "Đơn giá mặc định VND"],
    ["privateNote", "Ghi chú riêng"],
    ["archivedAt", "Lưu trữ UTC"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  sessions: [
    ["id", "Mã buổi"],
    ["studentId", "Mã học viên"],
    ["studentName", "Tên học viên"],
    ["sessionDate", "Ngày buổi"],
    ["startTime", "Giờ bắt đầu"],
    ["durationMinutes", "Thời lượng phút"],
    ["status", "Trạng thái"],
    ["billable", "Tính phí"],
    ["rateVnd", "Đơn giá buổi VND"],
    ["amountVnd", "Tiền buổi VND"],
    ["billedStatementId", "Mã bảng kê"],
    ["lessonId", "Mã buổi nhóm"],
    ["classId", "Mã lớp"],
    ["className", "Tên lớp đã lưu"],
    ["privateNote", "Ghi chú riêng"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  statements: [
    ["id", "Mã nội bộ bảng kê"],
    ["number", "Số bảng kê"],
    ["studentId", "Mã học viên"],
    ["status", "Trạng thái"],
    ["teacherSnapshot.displayName", "Tên giáo viên đã chốt"],
    ["recipientSnapshot.displayName", "Tên người nhận đã chốt"],
    ["bankSnapshot", "Thông tin nhận tiền đã chốt"],
    ["periodStart", "Từ ngày"],
    ["periodEnd", "Đến ngày"],
    ["issueDate", "Ngày phát hành"],
    ["dueDate", "Ngày đến hạn"],
    ["totalVnd", "Tổng VND"],
    ["paidVnd", "Đã thu VND"],
    ["remainingVnd", "Còn phải thu VND"],
    ["activePaymentCount", "Số khoản thu hợp lệ"],
    ["voidedAt", "Hủy UTC"],
    ["voidReason", "Lý do hủy"],
    ["createdAt", "Ngày tạo UTC"],
    ["updatedAt", "Cập nhật UTC"],
  ],
  statementItems: [
    ["statementId", "Mã nội bộ bảng kê"],
    ["statementNumber", "Số bảng kê"],
    ["position", "Dòng"],
    ["sessionId", "Mã buổi"],
    ["sessionDate", "Ngày buổi"],
    ["amountVnd", "Đơn giá đã chốt VND"],
  ],
  payments: [
    ["id", "Mã khoản thu"],
    ["statementId", "Mã bảng kê"],
    ["studentId", "Mã học viên"],
    ["amountVnd", "Số tiền VND"],
    ["receivedDate", "Ngày nhận tiền"],
    ["method", "Cách nhận"],
    ["privateNote", "Ghi chú riêng"],
    ["recordedAt", "Ghi nhận UTC"],
    ["voidedAt", "Vô hiệu hóa UTC"],
    ["voidReason", "Lý do vô hiệu hóa"],
  ],
  auditEvents: [
    ["id", "Mã thao tác"],
    ["entityType", "Loại dữ liệu"],
    ["entityId", "Mã dữ liệu"],
    ["action", "Thao tác"],
    ["safeMetadata", "Chi tiết"],
    ["createdAt", "Ngày ghi UTC"],
  ],
};
const without = (value: object, hidden: string[]) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !hidden.includes(key)),
  );
function records(
  dataset: Dataset,
  docs: DocumentSnapshot[],
): Record<string, unknown>[] {
  return docs.flatMap((doc): Record<string, unknown>[] => {
    if (dataset === "appearance") {
      if (!doc.exists) return [];
      const data = appearanceDocumentSchema.parse(doc.data());
      return [
        appearanceSchema.parse({
          theme: data.theme,
          schemaVersion: data.schemaVersion,
        }),
      ];
    }
    if (dataset === "classes") return [classDto(doc)];
    if (dataset === "lessons") return [lessonDto(doc)];
    if (dataset === "profile") {
      profileDocumentSchema.parse(doc.data());
      const value = dto(doc);
      return [
        {
          ...profileSchema.parse(
            Object.fromEntries(
              Object.keys(profileSchema.shape).map((key) => [key, value[key]]),
            ),
          ),
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        },
      ];
    }
    if (dataset === "students") return [studentDto(doc)];
    if (dataset === "sessions") {
      return [without(sessionDto(doc), ["requestId"])];
    }
    if (dataset === "payments") {
      return [without(paymentDto(doc), ["requestId"])];
    }
    if (dataset === "auditEvents")
      return [
        z
          .object({
            id: idSchema,
            entityType: z.string().max(50),
            entityId: idSchema,
            action: z.string().max(100),
            safeMetadata: z.record(
              z.string(),
              z.union([
                z.string(),
                z.number().int().refine(Number.isSafeInteger),
                z.boolean(),
                z.null(),
              ]),
            ),
            createdAt: z.string().datetime(),
            schemaVersion: z.literal(1),
          })
          .strict()
          .parse(dto(doc)),
      ];
    const value = statementDto(doc);
    if (dataset === "statementItems")
      return value.items.map((item, index) => ({
        statementId: value.id,
        statementNumber: value.number,
        position: index + 1,
        ...item,
      }));
    return [
      {
        ...without(value, ["activeShareTokenHash"]),
        remainingVnd:
          value.status === "issued" ? value.totalVnd - value.paidVnd : 0,
      },
    ];
  });
}
const translated: Record<string, string> = {
  planned: "Dự kiến",
  completed: "Đã dạy",
  cancelled: "Đã hủy",
  draft: "Nháp",
  issued: "Đã phát hành",
  void: "Đã hủy",
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
};
function csvValue(record: Record<string, unknown>, key: string, t: Translator) {
  let value: unknown = record;
  for (const part of key.split("."))
    value =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[part]
        : null;
  if ((key === "status" || key === "method") && typeof value === "string")
    return translated[value] ? t(translated[value]) : value;
  return typeof value === "boolean" ? t(value ? "Có" : "Không") : value;
}
export async function startExport(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const input = exportInputSchema.parse(raw),
    id = randomUUID();
  return operation(
    uid,
    "data-export",
    requestId,
    input,
    async (tx, root, now) => {
      const profile = await tx.get(root);
      if (!profile.exists) throw new AppError(404, "Không tìm thấy hồ sơ.");
      const data = jobSchema.parse({
        ...input,
        readTime: profile.readTime,
        createdAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 30 * 60000),
        schemaVersion: 1,
      });
      tx.create(root.collection("dataExports").doc(id), data);
      return { id };
    },
  );
}
export async function exportPage(
  uid: string,
  id: string,
  raw: unknown,
  locale: Locale = "vi",
): Promise<ExportPage> {
  await assertAccountAvailable(uid);
  const input = exportPageInputSchema.parse(raw),
    root = userRef(uid);
  const snapshot = await root
    .collection("dataExports")
    .doc(idSchema.parse(id))
    .get();
  if (!snapshot.exists)
    throw new AppError(404, "Không tìm thấy phiên xuất dữ liệu.");
  const job = jobSchema.parse(snapshot.data());
  if (job.expiresAt.toMillis() <= Date.now())
    throw new AppError(410, "Phiên xuất đã hết hạn. Hãy bắt đầu tải lại.");
  if (job.dataset !== "all" && job.dataset !== input.dataset)
    throw new AppError(400, "Loại dữ liệu không khớp phiên xuất.");
  const page = await admin().db.runTransaction(
    async (tx) => {
      if (input.dataset === "profile") {
        if (input.cursor) throw new AppError(400, "Hồ sơ chỉ có một trang.");
        return [await tx.get(root)];
      }
      if (input.dataset === "appearance") {
        if (input.cursor)
          throw new AppError(400, "Giao diện chỉ có một trang.");
        return [await tx.get(root.collection("preferences").doc("appearance"))];
      }
      let query = root
        .collection(
          input.dataset === "statementItems" ? "statements" : input.dataset,
        )
        .orderBy(FieldPath.documentId());
      if (input.cursor) query = query.startAfter(input.cursor);
      return (await tx.get(query.limit(input.limit + 1))).docs;
    },
    { readOnly: true, readTime: job.readTime },
  );
  const t = translator(locale);
  const selected = page.slice(0, input.limit),
    values = records(input.dataset, selected);
  const result = {
    csv:
      (!input.cursor
        ? csvLine(columns[input.dataset].map(([, label]) => t(label)))
        : "") +
      values
        .map((record) =>
          csvLine(
            columns[input.dataset].map(([key]) => csvValue(record, key, t)),
          ),
        )
        .join(""),
    records: values,
    nextCursor: page.length > input.limit ? selected.at(-1)!.id : null,
    exportedAt: job.readTime.toDate().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 3_000_000)
    throw new AppError(413, "Trang xuất quá lớn. Hãy giảm số mục mỗi trang.");
  return result;
}
