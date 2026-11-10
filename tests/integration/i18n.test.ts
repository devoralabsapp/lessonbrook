import { expect, it } from "vitest";
import { client, origin, googleToken } from "./helpers";

it("HTTP uses English by default, Vietnamese by preference, and never changes auth requirements", async () => {
  const fresh = await fetch(origin + "/api/students");
  expect(fresh.status).toBe(401);
  expect((await fresh.json()).error).toBe(
    "Your session has expired. Please sign in again.",
  );
  const vi = await client("vi");
  const response = await vi.call("/api/students");
  expect(response.status).toBe(401);
  expect((await response.json()).error).toBe(
    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  );
  for (const locale of ["en", "vi"]) {
    const page = await fetch(origin + "/help", {
      headers: { Cookie: `chotcong_locale=${locale}` },
    });
    expect(await page.text()).toContain(`<html lang="${locale}"`);
  }
});
it("language preference is validated, CSRF protected and independent of sign-in", async () => {
  const c = await client("en");
  const response = await c.call("/api/locale", "POST", { locale: "vi" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ locale: "vi" });
  expect(response.headers.get("cache-control")).toContain("no-store");
  const cookie = response.headers
    .getSetCookie()
    .find((v) => v.startsWith("chotcong_locale="))!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=lax");
  for (const body of [
    { locale: "fr" },
    { locale: "vi", ownerUid: "other" },
    { locale: ["en"] },
    {},
  ])
    expect((await c.call("/api/locale", "POST", body)).status).toBe(400);
  const wrongOrigin = await c.call(
    "/api/locale",
    "POST",
    { locale: "vi" },
    undefined,
    { Origin: "https://other.example" },
  );
  expect(wrongOrigin.status).toBe(403);
  expect(
    wrongOrigin.headers
      .getSetCookie()
      .some((v) => v.startsWith("chotcong_locale=")),
  ).toBe(false);
  expect(
    (
      await c.call("/api/locale", "POST", { locale: "vi" }, undefined, {
        "x-csrf-token": "",
      })
    ).status,
  ).toBe(403);
});

it("English CSV translates fixed headers while keeping entered values and raw JSON unchanged", async () => {
  const c = await client("en");
  await c.login((await googleToken()).idToken);
  expect(
    (
      await c.call("/api/students", "POST", {
        displayName: "Đã dạy",
        defaultRateVnd: 200000,
        privateNote: "Học viên",
      })
    ).ok,
  ).toBe(true);
  const start = await c.call("/api/exports", "POST", { dataset: "students" });
  expect(start.ok).toBe(true);
  const { id } = await start.json();
  const response = await c.call(`/api/exports/${id}?dataset=students`);
  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data.csv).toContain('"Student name"');
  expect(data.csv).toContain('"Private notes"');
  expect(data.csv).toContain('"Đã dạy"');
  expect(data.csv).toContain('"Học viên"');
  expect(data.records[0]).toMatchObject({
    displayName: "Đã dạy",
    defaultRateVnd: 200000,
    privateNote: "Học viên",
  });
});
