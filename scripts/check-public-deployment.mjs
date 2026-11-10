// Read-only browser/HTTP smoke checks. No Google login, Admin SDK or test data.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "http://localhost:3000";
const target = new URL(origin);
if (
  target.origin !== origin ||
  target.username ||
  target.password ||
  !(
    target.protocol === "https:" ||
    (target.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(target.hostname))
  )
)
  throw new Error(
    "Use an HTTPS origin, or explicit localhost/127.0.0.1 for local checks.",
  );

let step = "browser-start";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  for (const [path, heading] of [
    ["/help", "A simple daily routine"],
    ["/privacy", "The data in your ledger"],
  ]) {
    step = path;
    const response = await page.goto(origin + path);
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  step = "login";
  await page.goto(origin + "/login");
  const google = page.getByRole("button", { name: "Continue with Google" });
  await google.waitFor();
  assert(await google.isEnabled());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const privateHeaders = (response) => {
    const headers = response.headers();
    assert(headers["cache-control"]?.includes("no-store"));
    assert.equal(headers["referrer-policy"], "no-referrer");
    assert.equal(headers["x-robots-tag"], "noindex, nofollow");
  };
  for (const path of [
    "/app",
    "/app/students",
    "/onboarding",
    "/app/classes",
    "/app/lessons/new",
  ]) {
    step = path;
    const response = await context.request.get(origin + path, {
      maxRedirects: 0,
    });
    assert.equal(response.status(), 307);
    assert.equal(
      new URL(response.headers().location, origin).pathname,
      "/login",
    );
    privateHeaders(response);
  }
  for (const path of [
    "profile",
    "students",
    "sessions",
    "statements",
    "summary",
    "onboarding",
    "account/deletion",
    "classes",
    "lessons",
    "appearance",
  ]) {
    step = "/api/" + path;
    const response = await context.request.get(origin + step);
    assert.equal(response.status(), 401);
    privateHeaders(response);
  }
  step = "share-headers";
  privateHeaders(await context.request.get(origin + "/s"));
  step = "csrf-cookie";
  assert((await context.request.get(origin + "/api/auth/csrf")).ok());
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "chotcong_csrf",
  );
  assert(cookie?.httpOnly && cookie.sameSite === "Lax");
  assert.equal(cookie.secure, target.protocol === "https:");
  step = "manifest";
  const manifest = await (
    await context.request.get(origin + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/app");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "en");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const verifyPng = async (src, size) => {
    const url = new URL(src, origin);
    assert.equal(url.origin, origin);
    const response = await context.request.get(url.href);
    assert.equal(response.status(), 200);
    assert(response.headers()["content-type"]?.startsWith("image/png"));
    const bytes = await response.body();
    assert(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  };
  for (const [size, purpose] of [
    [192, "any"],
    [512, "any"],
    [512, "maskable"],
  ]) {
    step = `icon-${size}-${purpose}`;
    const icon = manifest.icons.find(
      (icon) => icon.sizes === `${size}x${size}` && icon.purpose === purpose,
    );
    assert.equal(icon?.type, "image/png");
    await verifyPng(icon.src, size);
  }
  step = "apple-icon";
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  assert(apple);
  await verifyPng(apple, 180);
  step = "language-switch";
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "Tiếng Việt", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "vi");
  await page.getByRole("button", { name: "Tiếp tục với Google" }).waitFor();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("lang"), "vi");
  const preference = (await context.cookies()).find(
    (cookie) => cookie.name === "chotcong_locale",
  );
  assert(preference?.httpOnly && preference.sameSite === "Lax");
  assert.equal(preference.secure, target.protocol === "https:");
  await page.getByRole("combobox", { name: "Ngôn ngữ", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  step = "no-offline-cache";
  assert.deepEqual(
    await page.evaluate(async () => ({
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: await caches.keys(),
    })),
    { workers: 0, caches: [] },
  );
  console.log(
    JSON.stringify({
      event: "deployment.public-smoke.passed",
      origin,
      viewport: 360,
      protectedPages: 5,
      privateApis: 10,
      pngIcons: 4,
      cloudBusinessWrites: false,
      authenticatedFlow: "not tested",
    }),
  );
} catch {
  // Report only a controlled check name; never dump response bodies or cookies.
  console.error(
    JSON.stringify({ event: "deployment.public-smoke.failed", step }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
