import { expect, it } from "vitest";
import { DEFAULT_LOCALE, parseLocale, translator } from "@/lib/i18n/core";
import english from "@/lib/i18n/en.json";
import { formatVnd } from "@/domain";
import { deletionInputSchema } from "@/domain/data";

it("defaults to English independently of browser language and rejects unknown cookie values", () => {
  expect(DEFAULT_LOCALE).toBe("en");
  for (const value of [undefined, "", "fr", "VI", "vi-VN", {}, "en"])
    expect(parseLocale(value)).toBe("en");
  expect(parseLocale("vi")).toBe("vi");
});
it("translates interface text while preserving inserted names, accents, braces and whitespace", () => {
  const name = "Đã dạy {1} — Hà";
  expect(translator("en")("Đã lưu học viên {0}.", { 0: name })).toBe(
    `Student ${name} saved.`,
  );
  expect(translator("vi")("Đã lưu học viên {0}.", { 0: name })).toBe(
    `Đã lưu học viên ${name}.`,
  );
  expect(translator("en")("  Đang tải… ")).toBe("  Loading… ");
  expect(translator("en")("toString")).toBe("toString");
  expect(translator("en")("Tên riêng chưa có trong từ điển")).toBe(
    "Tên riêng chưa có trong từ điển",
  );
});
it("every English entry retains exactly the original interpolation placeholders", () => {
  const placeholders = (s: string) => s.match(/\{\w+\}/g)?.sort() ?? [];
  for (const [source, translated] of Object.entries(english)) {
    expect(translated.trim(), source).not.toBe("");
    expect(placeholders(translated), source).toEqual(placeholders(source));
  }
});
it("English presentation keeps VND whole numbers and exact destructive confirmation in either language", () => {
  expect(formatVnd(200000, "en")).toContain("200,000");
  expect(formatVnd(200000, "vi")).toContain("200.000");
  const valid = { acknowledged: true, idToken: "fake-test-token" };
  for (const confirmation of ["DELETE ACCOUNT", "XÓA TÀI KHOẢN"])
    expect(
      deletionInputSchema.safeParse({ ...valid, confirmation }).success,
    ).toBe(true);
  for (const confirmation of ["delete account", "DELETE", " DELETE ACCOUNT "])
    expect(
      deletionInputSchema.safeParse({ ...valid, confirmation }).success,
    ).toBe(false);
});
