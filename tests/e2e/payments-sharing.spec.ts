import { expect, test } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
import { vietnamToday } from "../../src/domain";
import { addBusinessDays } from "../../src/domain/statements";

test("360px: thu từng phần → mất response tạo link → link mới → xem không đăng nhập → sửa sổ → thu hồi", async ({
  page,
  context,
  browser,
}) => {
  const token = await googleToken();
  const csrf = await context.request.get("/api/auth/csrf");
  const { token: csrfToken } = await csrf.json();
  const headers = { Origin: origin, "x-csrf-token": csrfToken };
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers,
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBeTruthy();
  const create = async (path: string, data: unknown) => {
    const r = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const today = vietnamToday();
  const student = await create("/api/students", {
    displayName: "Lan thu học phí",
    defaultRateVnd: 200000,
    phone: "0900000000",
    privateNote: "PRIVATE STUDENT NOTE",
  });
  const ids: string[] = [];
  for (let i = 0; i < 8; i++)
    ids.push(
      (
        await create("/api/sessions", {
          studentId: student.id,
          sessionDate: today,
          status: "completed",
          billable: true,
          privateNote: "PRIVATE SESSION NOTE",
        })
      ).id,
    );
  const statement = await create("/api/statements", {
    studentId: student.id,
    sessionIds: ids,
    periodStart: today,
    periodEnd: today,
    dueDate: addBusinessDays(today, -1),
    includeBankDetails: false,
  });
  await create(`/api/statements/${statement.id}/issue`, { version: 1 });
  expect(
    (
      await context.request.patch("/api/appearance", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: { theme: "command-line" },
      })
    ).ok(),
  ).toBe(true);
  let failStatus = true;
  await page.route(`**/api/statements/${statement.id}/share`, async (route) => {
    if (route.request().method() === "GET" && failStatus) {
      failStatus = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Chưa tải được trạng thái chia sẻ." }),
      });
    }
    return route.continue();
  });
  await page.goto(`/app/statements/${statement.id}`);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Chưa tải được trạng thái chia sẻ" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tải lại trạng thái", exact: true })
    .click();
  await expect(
    page.getByText("Chia sẻ đang tắt hoặc link đã hết hạn.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Số tiền nhận (VND)", { exact: true }).fill("1000000");
  await page
    .getByLabel("Ghi chú khoản thu (riêng)", { exact: true })
    .fill("PRIVATE PAYMENT NOTE");
  await page
    .getByRole("button", { name: "Lưu khoản thu", exact: true })
    .click();
  await expect(page.getByTestId("payment-row")).toHaveCount(1);
  await expect(
    page.getByLabel("Số tiền nhận (VND)", { exact: true }),
  ).toHaveValue("");
  await page.goto("/app/statements?status=partial");
  await expect(page.getByLabel("Trạng thái bảng kê")).toHaveValue("partial");
  await expect(
    page.getByRole("link", { name: /Lan thu học phí/ }),
  ).toBeVisible();
  await page.getByLabel("Trạng thái bảng kê").selectOption("paid");
  await expect(
    page.getByRole("heading", { name: "Chưa có bảng kê trong danh sách này." }),
  ).toBeVisible();
  await page.getByLabel("Trạng thái bảng kê").selectOption("overdue");
  await page.getByRole("link", { name: /Lan thu học phí/ }).click();
  const beginPreview = async () => {
    await page
      .getByRole("button", { name: "Xem trước để tạo link", exact: true })
      .click();
    await expect(page.getByTestId("public-remaining")).toContainText("600.000");
    await expect(page.getByTestId("public-statement")).toHaveCSS(
      "color-scheme",
      "light",
    );
    await expect(page.getByTestId("public-statement")).toHaveCSS(
      "color",
      "rgb(37, 58, 48)",
    );
    await expect(page.getByTestId("public-statement")).not.toContainText(
      "PRIVATE",
    );
    await page
      .getByRole("checkbox", {
        name: "Tôi đã kiểm tra nội dung công khai phía trên",
        exact: true,
      })
      .check();
  };
  await beginPreview();
  const keys: string[] = [];
  await page.route(`**/api/statements/${statement.id}/share`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Tạo link chia sẻ mới", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn được giữ" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tạo link chia sẻ mới", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "mã gốc không thể lấy lại" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(
    page.getByLabel("Link chia sẻ mới", { exact: true }),
  ).toHaveCount(0);
  await beginPreview();
  await page
    .getByRole("button", { name: "Tạo link chia sẻ mới", exact: true })
    .click();
  const linkInput = page.getByLabel("Link chia sẻ mới", { exact: true });
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();
  expect(new URL(link).pathname).toBe("/s");
  expect(new URL(link).hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
  expect(keys[2]).not.toBe(keys[1]);
  const guest = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  try {
    const recipient = await guest.newPage();
    const urls: string[] = [];
    recipient.on("request", (request) => urls.push(request.url()));
    await recipient.goto(link);
    await expect(recipient.getByTestId("public-remaining")).toContainText(
      "600.000",
    );
    await expect(
      recipient.getByText("Thu một phần · Theo ghi nhận của giáo viên", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(recipient.locator("body")).not.toContainText("PRIVATE");
    await expect(recipient.locator("body")).not.toContainText("0900000000");
    expect(urls.some((url) => url.includes(new URL(link).hash.slice(1)))).toBe(
      false,
    );
    expect(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await recipient.screenshot({
      path: "docs/screenshots/public-statement.png",
      fullPage: true,
    });
    await page.getByLabel("Số tiền nhận (VND)", { exact: true }).fill("600000");
    await page
      .getByRole("button", { name: "Lưu khoản thu", exact: true })
      .click();
    await expect(page.getByTestId("payment-row")).toHaveCount(2);
    await recipient
      .getByRole("button", { name: "Cập nhật số liệu", exact: true })
      .click();
    await expect(recipient.getByTestId("public-remaining")).toHaveText(
      /^0\s*₫$/,
    );
    const first = page
      .getByTestId("payment-row")
      .filter({ hasText: "1.000.000" });
    await first.locator("summary").click();
    await first
      .getByLabel("Lý do vô hiệu hóa", { exact: true })
      .fill("PRIVATE REASON");
    await first
      .getByRole("button", { name: "Xác nhận vô hiệu hóa", exact: true })
      .click();
    await expect(first).toContainText("Đã vô hiệu hóa");
    await recipient
      .getByRole("button", { name: "Cập nhật số liệu", exact: true })
      .click();
    await expect(recipient.getByTestId("public-remaining")).toContainText(
      "1.000.000",
    );
    await expect(recipient.locator("body")).not.toContainText("PRIVATE");
    await page
      .getByRole("button", { name: "Thu hồi link", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thu hồi link chia sẻ" }),
    ).toBeVisible();
    await recipient.reload();
    await expect(
      recipient.getByRole("heading", {
        name: "Bảng kê không khả dụng",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    await guest.close();
  }
});
