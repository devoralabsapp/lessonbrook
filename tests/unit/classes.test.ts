import { expect, it } from "vitest";
import { classInputSchema, lessonInputSchema } from "@/domain/classes";
import { appearanceInputSchema, themes } from "@/domain/appearance";
const input = { displayName: "Piano", studentIds: ["a", "b"], rateVnd: 150000 };
it("lớp có giá nguyên mỗi người; roster giới hạn, duy nhất, không nhận owner/path", () => {
  expect(classInputSchema.parse(input).rateVnd).toBe(150000);
  for (const extra of [
    { studentIds: [] },
    { studentIds: ["a", "a"] },
    { studentIds: Array.from({ length: 51 }, (_, i) => `s${i}`) },
    { rateVnd: 1.5 },
    { studentIds: ["../../other"] },
    { ownerUid: "b" },
  ])
    expect(classInputSchema.safeParse({ ...input, ...extra }).success).toBe(
      false,
    );
});
it("buổi nhóm không nhận số tiền tổng/session IDs, validate ngày và giữ trạng thái khi sửa", () => {
  const lesson = {
    studentIds: ["a"],
    rateVnd: 150000,
    sessionDate: "2026-10-16",
    status: "completed",
    billable: true,
  };
  expect(lessonInputSchema.safeParse(lesson).success).toBe(true);
  expect(
    lessonInputSchema.safeParse({ ...lesson, status: null, billable: null })
      .success,
  ).toBe(true);
  for (const extra of [
    { status: null },
    { status: "cancelled" },
    { sessionDate: "2026-02-30" },
    { sessionIds: ["foreign"] },
    { totalVnd: 1 },
    { ownerUid: "b" },
  ])
    expect(lessonInputSchema.safeParse({ ...lesson, ...extra }).success).toBe(
      false,
    );
});
it("chỉ chấp nhận tám theme đã khai báo", () => {
  expect(new Set(themes.map((s) => s.id)).size).toBe(8);
  for (const theme of themes)
    expect(appearanceInputSchema.safeParse({ theme: theme.id }).success).toBe(
      true,
    );
  expect(appearanceInputSchema.safeParse({ theme: "unknown" }).success).toBe(
    false,
  );
  expect(
    appearanceInputSchema.safeParse({ theme: "art", ownerUid: "other" })
      .success,
  ).toBe(false);
});
