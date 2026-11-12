import { expect, test } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
import { chooseOption } from "./select";
test("360px: tìm học viên → chọn buổi → phát hành trực tiếp → sửa khóa → hủy", async ({
  page,
  context,
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
  const create = async (path: string, body: unknown) => {
    const response = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: body,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const student = await create("/api/students", {
    displayName: "Lan bảng kê",
    defaultRateVnd: 200000,
  });
  for (let i = 1; i <= 8; i++)
    await create("/api/sessions", {
      studentId: student.id,
      sessionDate: `2026-10-${String(i).padStart(2, "0")}`,
      status: "completed",
      billable: true,
    });
  await create("/api/sessions", {
    studentId: student.id,
    sessionDate: "2026-10-09",
    status: "cancelled",
    billable: false,
  });
  await page.goto("/app/statements/new");
  const studentPicker = page.getByRole("combobox", {
    name: "Học viên",
    exact: true,
  });
  const search = page.getByRole("combobox", { name: "Tìm tên học viên" });
  await expect(search).toHaveCount(0);
  await studentPicker.click();
  await search.fill("Lan bang ke");
  await page.getByRole("option", { name: "Lan bảng kê", exact: true }).click();
  await expect(search).toHaveCount(0);
  const period = page.getByRole("combobox", { name: "Kỳ học" });
  const dueDate = page.getByLabel("Ngày đến hạn", { exact: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(period).toHaveText("Tháng này");
  const presetTop = (await studentPicker.boundingBox())!.y;
  for (const field of [period, dueDate])
    expect((await field.boundingBox())!.y).toBeCloseTo(presetTop, 0);
  await chooseOption(period, "week");
  await expect(period).toHaveText("Tuần này");
  await chooseOption(period, "custom");
  const from = page.getByLabel("Từ ngày", { exact: true });
  const to = page.getByLabel("Đến ngày", { exact: true });
  const customTop = (await studentPicker.boundingBox())!.y;
  for (const field of [period, from, to, dueDate])
    expect((await field.boundingBox())!.y).toBeCloseTo(customTop, 0);
  await page.setViewportSize({ width: 360, height: 800 });
  await from.fill("2026-10-01");
  await to.fill("2026-10-31");
  await expect(page.getByRole("checkbox", { name: /^Buổi / })).toHaveCount(8);
  const selectAll = page.getByRole("checkbox", { name: "Chọn tất cả buổi" });
  await selectAll.check();
  await expect(page.getByTestId("statement-selection-total")).toContainText(
    "1.600.000",
  );
  const keys: string[] = [];
  await page.route("**/api/statements/issue", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lập bảng kê", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn được giữ" }),
  ).toBeVisible();
  await expect(selectAll).toBeChecked();
  await page.getByRole("button", { name: "Lập bảng kê", exact: true }).click();
  await page.waitForURL(/\/app\/statements\/[a-f0-9-]+$/);
  const statementUrl = page.url();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(page.getByTestId("statement-total")).toContainText("1.600.000");
  const issued = page.getByRole("heading", { name: /^CC-\d{4}-\d+/ });
  await expect(issued).toBeVisible();
  const number = await issued.textContent();
  await page.getByRole("button", { name: "Sửa bảng kê", exact: true }).click();
  const lesson = page.getByRole("checkbox", { name: /^Buổi / }).last();
  await expect(page.getByRole("checkbox", { name: /^Buổi / })).toHaveCount(8);
  await expect(lesson).toBeChecked();
  await lesson.uncheck();
  await page.getByRole("button", { name: "Lưu thay đổi bảng kê" }).click();
  await expect(issued).toHaveText(number!);
  await page.reload();
  await expect(page.getByTestId("statement-total")).toContainText("1.400.000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto(`/app/students/${student.id}`);
  const lessonEditButtons = page
    .locator(".status-completed")
    .locator("..")
    .getByRole("button", { name: "Sửa", exact: true });
  await expect(lessonEditButtons.and(page.locator(":disabled"))).toHaveCount(7);
  await expect(lessonEditButtons.and(page.locator(":enabled"))).toHaveCount(1);
  await expect(
    page
      .locator(".status-cancelled")
      .locator("..")
      .getByRole("button", { name: "Sửa", exact: true }),
  ).toBeEnabled();
  await page.goto(statementUrl);
  await page.locator("summary").filter({ hasText: "Hủy bảng kê" }).click();
  await page
    .getByLabel("Lý do hủy", { exact: true })
    .fill("Đối chiếu lại kỳ học thử");
  await page
    .getByRole("button", { name: "Xác nhận hủy bảng kê", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bảng kê đã hủy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Lập bảng kê mới", exact: true })
    .click();
  await chooseOption(period, "custom");
  await page.getByLabel("Từ ngày", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Đến ngày", { exact: true }).fill("2026-10-31");
  await expect(page.getByRole("checkbox", { name: /^Buổi / })).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/app/statements");
  await expect(search).toHaveCount(0);
  await studentPicker.click();
  await search.fill("Lan bang ke");
  await page.getByRole("option", { name: "Lan bảng kê", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /CC-.*Lan bảng kê/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
