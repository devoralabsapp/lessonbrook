import { z } from "zod";
import { dateSchema, idSchema, lessonTimeSchema, moneySchema } from ".";

export const MAX_CLASS_STUDENTS = 50;
export const MAX_WEEKLY_SLOTS = 35;
export const weekdays = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ nhật",
] as const;
const weeklySlotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    time: lessonTimeSchema,
  })
  .strict();
export type WeeklySlot = z.infer<typeof weeklySlotSchema>;
const weeklyScheduleSchema = z
  .array(weeklySlotSchema)
  .max(MAX_WEEKLY_SLOTS)
  .refine(
    (slots) =>
      new Set(slots.map(({ weekday, time }) => `${weekday}:${time}`)).size ===
      slots.length,
    "Các giờ học hằng tuần không được trùng nhau.",
  )
  .transform((slots) =>
    slots.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)),
  );
export const participantIdsSchema = z
  .array(idSchema)
  .min(1)
  .max(MAX_CLASS_STUDENTS)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Học viên không được lặp lại.",
  );
export const classInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    studentIds: participantIdsSchema,
    rateVnd: moneySchema,
    privateNote: z.string().trim().max(1000).default(""),
    weeklySchedule: weeklyScheduleSchema.optional(),
  })
  .strict();
export const classSchema = classInputSchema.extend({
  weeklySchedule: weeklyScheduleSchema.default([]),
  id: idSchema,
  archivedAt: z.string().nullable(),
  nextLessonAt: z.iso.datetime().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.literal(1),
});
const lessonFields = z
  .object({
    classId: idSchema.nullable().default(null),
    studentIds: participantIdsSchema,
    rateVnd: moneySchema,
    sessionDate: dateSchema,
    startTime: lessonTimeSchema.nullable().default(null),
    durationMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    status: z.enum(["planned", "completed", "cancelled"]).nullable(),
    billable: z.boolean().nullable(),
    privateNote: z.string().trim().max(1000).default(""),
  })
  .strict();
export const lessonInputSchema = lessonFields
  .refine(
    (v) => (v.status === null) === (v.billable === null),
    "Chọn cả trạng thái và tính phí, hoặc giữ nguyên cả hai.",
  )
  .refine(
    (v) => v.status !== "cancelled" || v.billable === false,
    "Buổi hủy không tính phí.",
  );
export const lessonSchema = lessonFields
  .omit({ status: true, billable: true })
  .extend({
    id: idSchema,
    className: z.string().max(100).nullable(),
    sessionIds: participantIdsSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    schemaVersion: z.literal(1),
  });
export type TeachingClass = z.infer<typeof classSchema>;
export type GroupLesson = z.infer<typeof lessonSchema>;
