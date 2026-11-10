import { expect, test } from "@playwright/test";
import { origin } from "../integration/helpers";
import { GUEST_THEME_COOKIE } from "../../src/domain/appearance";

test("popup bị chặn → đóng lỗi/thử lại với browser storage bị chặn → Google Emulator → cookie server", async ({
  page,
  context,
}) => {
  await context.addInitScript(
    ({ origin }) => {
      if (location.origin !== origin) return;
      // Real browser restrictions, no fake Firebase result/session/token.
      for (const key of ["localStorage", "sessionStorage", "indexedDB"])
        Object.defineProperty(window, key, {
          configurable: true,
          get() {
            throw new DOMException(
              "Storage unavailable for test",
              "SecurityError",
            );
          },
        });
      let denied = false;
      const open = window.open.bind(window);
      window.open = ((...args: Parameters<typeof window.open>) => {
        if (!denied) {
          denied = true;
          return null;
        }
        return open(...args);
      }) as typeof window.open;
    },
    { origin },
  );
  await context.route(
    /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
  await context.route(/^https:\/\/apis\.google\.com\//, async (route) => {
    await route.fulfill({ response: await route.fetch({ timeout: 15000 }) });
  });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Xem thử giao diện" })
    .selectOption("command-line");
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/login");
  await expect(page.getByRole("main")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  const button = page.getByRole("button", {
    name: "Tiếp tục với Google",
  });
  await button.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Cho phép popup" }),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect((await context.request.get("/api/profile")).status()).toBe(401);
  const popupPromise = page.waitForEvent("popup");
  await button.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup
    .locator("#email-input")
    .fill(`recovery-${crypto.randomUUID()}@example.test`);
  await popup.locator("#display-name-input").fill("Cô Lan thử lại");
  const relayElement = await page.waitForSelector(
    'iframe[src*="/emulator/auth/iframe"]',
    { state: "attached" },
  );
  const relay = await relayElement!.contentFrame();
  await relay!.waitForFunction(
    "Boolean(window.parentContainer)",
    {},
    { timeout: 20000, polling: 100 },
  );
  await popup
    .getByRole("button", { name: "Sign in with Google.com", exact: true })
    .click();
  await page.waitForURL("**/app");
  await expect(
    page.getByText("Học viên đang học", { exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "chotcong_session",
    )?.httpOnly,
  ).toBe(true);
  expect((await context.request.get("/api/profile")).status()).toBe(200);
  await expect(page.locator('[data-theme="command-line"]')).toBeVisible();
  expect(
    (await (await context.request.get("/api/appearance")).json()).theme,
  ).toBe("command-line");
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === GUEST_THEME_COOKIE,
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.locator('[data-theme="command-line"]')).toBeVisible();
  expect(
    await page.evaluate(() => {
      try {
        void localStorage;
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});
