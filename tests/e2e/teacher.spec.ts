import { test, expect } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
test("Google popup Emulator → session HttpOnly → đăng xuất", async ({
  page,
  context,
}) => {
  // Emulator widget scripts are local; skip optional CDN styling/fonts so CI
  // cannot click the widget before a slow external asset lets handlers attach.
  await context.route(
    /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
  // Keep the official Google scripts unchanged when browser CDN requests hang.
  // Auth messages, popup interaction, ID tokens and session exchange stay real.
  await context.route(/^https:\/\/apis\.google\.com\//, async (route) => {
    await route.fulfill({ response: await route.fetch({ timeout: 15000 }) });
  });
  await page.goto("/login");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup
    .locator("#email-input")
    .fill(`popup-${crypto.randomUUID()}@example.test`);
  await popup.locator("#display-name-input").fill("Cô Mai thử nghiệm");
  const relayElement = await page.waitForSelector(
    'iframe[src*="/emulator/auth/iframe"]',
    { state: "attached" },
  );
  const relay = await relayElement!.contentFrame();
  await relay!.waitForFunction(
    "Boolean(window.parentContainer)",
    {},
    // Hidden relay frames can pause requestAnimationFrame; poll with a timer.
    { timeout: 20000, polling: 100 },
  );
  await popup
    .getByRole("button", { name: "Sign in with Google.com", exact: true })
    .click();
  await page.waitForURL("**/app");
  await expect(
    page.getByText("Học viên đang học", { exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "chotcong_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.includes("authUser")),
    ),
  ).toEqual([]);
  await page.goto("/app/settings");
  await expect(page.getByLabel("Tên giáo viên / tên lớp")).toHaveValue(
    "Cô Mai thử nghiệm",
  );
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.waitForURL("**/login");
  expect((await context.request.get("/api/profile")).status()).toBe(401);
});
test("giáo viên 360px: học viên → buổi → reload → giá mới không đổi lịch sử", async ({
  page,
  context,
}) => {
  const token = await googleToken();
  const csrf = await context.request.get("/api/auth/csrf");
  const { token: csrfToken } = await csrf.json();
  const login = await context.request.post("/api/auth/session", {
    headers: { Origin: origin, "x-csrf-token": csrfToken },
    data: { idToken: token.idToken },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto("/app/students");
  await expect(
    page.getByRole("heading", { name: "Bắt đầu với học viên đầu tiên" }),
  ).toBeVisible();
  const refreshStarted = Promise.withResolvers<void>();
  const releaseRefresh = Promise.withResolvers<void>();
  await page.route("**/api/students?archived=false", async (route) => {
    refreshStarted.resolve();
    await releaseRefresh.promise;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Thêm học viên", exact: true })
    .first()
    .click();
  await page.getByLabel("Tên học viên").fill("Lan E2E");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Đơn giá mặc định")).toBeFocused();
  await page.getByLabel("Đơn giá mặc định").fill("200000");
  await page.getByRole("button", { name: "Lưu học viên", exact: true }).click();
  try {
    await refreshStarted.promise;
    await expect(
      page.getByRole("status").filter({ hasText: "Đã lưu học viên Lan E2E" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lan E2E", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/200\.000/)).toHaveCount(0);
  } finally {
    releaseRefresh.resolve();
  }
  await page.getByRole("link", { name: "Lan E2E", exact: true }).click();
  await expect(page.getByText(/Đơn giá hiện tại:/)).toBeVisible();
  await page.getByRole("button", { name: "Ghi buổi dạy", exact: true }).click();
  await page.getByLabel("Ngày dạy").fill("2026-10-15");
  const keys: string[] = [];
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lưu buổi dạy", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn ở đây" }),
  ).toBeVisible();
  await expect(page.getByLabel("Ngày dạy")).toHaveValue("2026-10-15");
  await page.getByRole("button", { name: "Thử lưu lại", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu buổi Lan E2E" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.reload();
  await expect(
    page.getByText("200.000", { exact: false }).last(),
  ).toBeVisible();
  await expect(page.locator(".status-completed")).toBeVisible();
  await expect(page.locator(".status-completed")).toHaveCount(1);
  await page.getByRole("button", { name: "Sửa học viên", exact: true }).click();
  await page.getByLabel("Đơn giá mặc định").fill("250000");
  await page.getByRole("button", { name: "Lưu học viên", exact: true }).click();
  await page.getByRole("button", { name: "Ghi buổi dạy", exact: true }).click();
  await expect(page.getByLabel("Đơn giá buổi này")).toHaveValue("250000");
  await page.getByRole("button", { name: "Để sau", exact: true }).click();
  await expect(
    page.getByText("200.000", { exact: false }).last(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/app");
  await expect(
    page.getByText("Buổi chưa lập bảng kê", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("200.000", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/chotcong-mobile.png",
    fullPage: true,
  });
});
