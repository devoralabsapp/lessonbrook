import { expect, it } from "vitest";
import {
  addBusinessDays,
  statementDisplayStatus,
  statementDraftInputSchema,
  statementTotal,
} from "@/domain/statements";
const draft = {
  studentId: "lan",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  dueDate: "2026-11-07",
  sessionIds: ["session-1"],
};
it("tổng 8 buổi × 200.000đ và tổng 100 buổi lớn hơn trần đơn giá vẫn là integer an toàn", () => {
  expect(
    statementTotal(Array.from({ length: 8 }, () => ({ amountVnd: 200000 }))),
  ).toBe(1600000);
  expect(
    statementTotal(
      Array.from({ length: 100 }, () => ({ amountVnd: 1000000000 })),
    ),
  ).toBe(100000000000);
  expect(() => statementTotal([{ amountVnd: 0.5 }])).toThrow();
});
it("nháp từ chối trùng buổi, vượt 100 buổi, khoảng ngược, ngày sai và tổng client tự nhập", () => {
  expect(statementDraftInputSchema.safeParse(draft).success).toBe(true);
  for (const change of [
    { sessionIds: [] },
    { sessionIds: ["same", "same"] },
    { sessionIds: Array.from({ length: 101 }, (_, i) => `session-${i}`) },
    { periodStart: "2026-11-01" },
    { dueDate: "2026-02-30" },
    { totalVnd: 1 },
    { ownerId: "other-user" },
  ])
    expect(
      statementDraftInputSchema.safeParse({ ...draft, ...change }).success,
    ).toBe(false);
});
it("mặc định cộng 7 ngày qua cuối tháng/năm mà không phụ thuộc múi giờ server", () => {
  expect(addBusinessDays("2026-12-28", 7)).toBe("2027-01-04");
  expect(addBusinessDays("2028-02-25", 7)).toBe("2028-03-03");
});
it("quá hạn là nhãn bổ sung; đúng ngày đến hạn, nháp và bản hủy chưa tính quá hạn", () => {
  const statement = {
    status: "issued" as const,
    totalVnd: 1600000,
    paidVnd: 1000000,
    dueDate: "2026-10-16",
  };
  expect(statementDisplayStatus(statement, "2026-10-16")).toEqual({
    label: "Chưa thu",
    overdue: false,
  });
  expect(statementDisplayStatus(statement, "2026-10-17")).toEqual({
    label: "Chưa thu",
    overdue: true,
  });
  expect(
    statementDisplayStatus({ ...statement, paidVnd: 1600000 }, "2026-10-17"),
  ).toEqual({ label: "Đã thu đủ", overdue: false });
  expect(
    statementDisplayStatus({ ...statement, status: "draft" }, "2026-10-17")
      .overdue,
  ).toBe(false);
  expect(
    statementDisplayStatus({ ...statement, status: "void" }, "2026-10-17")
      .overdue,
  ).toBe(false);
});
