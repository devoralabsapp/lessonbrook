import { expect, it } from "vitest";
import { buildStatementEmail } from "@/lib/email/statement-template";

const statement = {
  id: "statement-demo",
  status: "issued" as const,
  number: "CC-2026-000001",
  teacherSnapshot: { displayName: "Demo Teacher" },
  recipientSnapshot: { displayName: "Alex Rivera" },
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  issueDate: "2026-11-13",
  dueDate: "2026-11-20",
  items: [
    { sessionId: "lesson-2", sessionDate: "2026-11-09", amountVnd: 200000 },
    { sessionId: "lesson-1", sessionDate: "2026-11-02", amountVnd: 200000 },
  ],
  totalVnd: 400000,
  paidVnd: 100000,
  privateNote: "PRIVATE TEACHER NOTE",
};
const options = {
  url: "https://ledger.example.test/s#" + "a".repeat(43),
  expiresAt: "2026-12-13T16:59:00Z",
  locale: "en" as const,
};

it("includes the tuition summary, lesson dates, due date and live link in both alternatives", () => {
  const message = buildStatementEmail(statement, options);
  expect(message.subject).toBe(
    "Tuition statement CC-2026-000001 · Alex Rivera",
  );
  for (const content of [message.text, message.html]) {
    for (const detail of [
      "Alex Rivera",
      "Demo Teacher",
      "CC-2026-000001",
      "400,000",
      "100,000",
      "300,000",
      "20 Nov 2026",
      "View tuition statement",
      options.url,
    ]) {
      expect(content).toContain(detail);
    }
    expect(content).not.toContain(statement.privateNote);
  }
  expect(message.html.indexOf("2 Nov 2026")).toBeLessThan(
    message.html.indexOf("9 Nov 2026"),
  );
  expect(message.html).toContain("13 Dec 2026");
  expect(message.html).toContain("23:59");
  expect(message.text).toContain("latest payments");
});

it("escapes names and treats paid statements as receipts while supporting Vietnamese", () => {
  const malicious = '<img src=x onerror="alert(1)"> & "Demo"';
  const message = buildStatementEmail(
    {
      ...statement,
      teacherSnapshot: { displayName: malicious },
      paidVnd: statement.totalVnd,
    },
    { ...options, locale: "vi" },
  );
  expect(message.html).not.toContain("<img");
  expect(message.html).toContain("&lt;img");
  expect(message.html).toContain("&amp;");
  expect(message.html).toContain("Giáo viên đã ghi nhận đủ học phí");
  expect(message.html).toContain("Đã thu đủ");
  expect(message.text).toContain(malicious);
  expect(message.subject).toContain("Bảng kê học phí");
  expect(message.html).toContain('lang="vi"');
});

it("renders the maximum 100 lessons without changing the source order", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    sessionId: `lesson-${index}`,
    sessionDate: index % 2 ? "2026-11-02" : "2026-11-09",
    amountVnd: 200000,
  }));
  const original = JSON.stringify(items);
  const message = buildStatementEmail(
    { ...statement, items, totalVnd: 20000000 },
    options,
  );
  expect(
    message.html.match(/<td style="padding:10px 12px;border-top/g),
  ).toHaveLength(200);
  expect(Buffer.byteLength(message.html)).toBeLessThan(100_000);
  expect(JSON.stringify(items)).toBe(original);
});
