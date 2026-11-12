import { expect, test, type BrowserContext } from "@playwright/test";
import { Firestore } from "firebase-admin/firestore";
import { googleToken, origin } from "../integration/helpers";
import { vietnamToday } from "../../src/domain";
import { chooseOption } from "./select";
async function login(context: BrowserContext) {
  const token = await googleToken();
  const { token: csrf } = await (
    await context.request.get("/api/auth/csrf")
  ).json();
  const headers = { Origin: origin, "x-csrf-token": csrf };
  const response = await context.request.post("/api/auth/session", {
    headers,
    data: { idToken: token.idToken },
  });
  expect(response.ok()).toBe(true);
  return {
    uid: token.uid,
    create: async (path: string, data: unknown) => {
      const response = await context.request.post(path, {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data,
      });
      expect(response.ok()).toBe(true);
      return response.json();
    },
  };
}
test("360px: hướng dẫn lần đầu → mất response xác nhận → tiếp tục sau reload → ghi buổi → tổng quan", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/app");
  await page.getByRole("link", { name: "Thiết lập sổ của bạn" }).click();
  await page.getByLabel("Tên giáo viên / tên lớp").fill("Cô Mai piano");
  const keys: string[] = [];
  await page.route("**/api/onboarding", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Lưu và tiếp tục" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn được giữ" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tên giáo viên / tên lớp")).toHaveValue(
    "Cô Mai piano",
  );
  await page.getByRole("button", { name: "Lưu và tiếp tục" }).click();
  await page.getByRole("button", { name: "Thêm học viên đầu tiên" }).click();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.getByLabel("Tên học viên").fill("An buổi đầu");
  await page.getByRole("button", { name: "Lưu học viên", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ghi buổi đã dạy đầu tiên" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ghi buổi đã dạy đầu tiên" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ghi buổi đầu tiên", exact: true })
    .click();
  await page.getByLabel("Đơn giá buổi này").fill("200000");
  await page.getByLabel("Ngày dạy").fill(vietnamToday());
  await page.getByRole("button", { name: "Lưu buổi dạy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sổ của bạn đã sẵn sàng" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Xem tổng quan", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Thiết lập sổ của bạn" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("200.000", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Buổi chưa lập bảng kê", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Trạng thái thanh toán", exact: true }),
  ).toHaveText("Buổi chưa lập bảng kê");
  await expect(
    page.getByRole("link", { name: "An buổi đầu", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("360px: tìm ngoài trang đầu/không dấu/lưu trữ, bỏ phản hồi cũ và lọc buổi chưa thu học phí", async ({
  page,
  context,
}) => {
  const account = await login(context);
  const student = await account.create("/api/students", {
    displayName: "Lan gốc",
    defaultRateVnd: 200000,
  });
  const db = new Firestore({
    projectId: "demo-chotcong",
    host: process.env.FIRESTORE_EMULATOR_HOST!,
    ssl: false,
  });
  try {
    const root = db.doc(`apps/chotcong/users/${account.uid}`),
      template = (
        await root.collection("students").doc(student.id).get()
      ).data()!,
      batch = db.batch();
    for (let i = 0; i < 205; i++)
      batch.create(root.collection("students").doc(`row-${i}`), {
        ...template,
        displayName: `A Học viên ${String(i).padStart(3, "0")}`,
      });
    for (let i = 0; i < 3; i++)
      batch.create(root.collection("students").doc(`anh-${i}`), {
        ...template,
        displayName: "Z Đặng Hồng Ánh",
      });
    await batch.commit();
    await page.goto("/app/students");
    const search = page.getByLabel("Tìm học viên", { exact: true });
    await search.fill("dang hong anh");
    await page.getByRole("button", { name: "Tìm tiếp", exact: true }).click();
    await expect(page.getByRole("link", { name: /Đặng Hồng Ánh/ })).toHaveCount(
      3,
    );
    const held = Promise.withResolvers<void>(),
      requested = Promise.withResolvers<void>();
    await page.route("**/api/students?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("q") === "lan") {
        const response = await route.fetch();
        requested.resolve();
        await held.promise;
        return route.fulfill({ response });
      }
      return route.continue();
    });
    await search.fill("lan");
    await requested.promise;
    await search.fill("Ánh");
    await page.getByRole("button", { name: "Tìm tiếp", exact: true }).click();
    await expect(page.getByRole("link", { name: /Đặng Hồng Ánh/ })).toHaveCount(
      3,
    );
    const late = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get("q") === "lan",
    );
    held.resolve();
    await late;
    await expect(page.getByRole("link", { name: /Đặng Hồng Ánh/ })).toHaveCount(
      3,
    );
    await expect(page.getByRole("link", { name: /Lan gốc/ })).toHaveCount(0);
    await page.unroute("**/api/students?**");
    await chooseOption(
      page.getByRole("combobox", { name: "Trạng thái học viên" }),
      "true",
    );
    await expect(
      page.getByText("Không tìm thấy học viên phù hợp."),
    ).toBeVisible();
    for (const [status, billable] of [
      ["completed", true],
      ["completed", false],
      ["cancelled", false],
    ] as const)
      await account.create("/api/sessions", {
        studentId: student.id,
        sessionDate: vietnamToday(),
        status,
        billable,
      });
    await page.goto("/app/sessions");
    await chooseOption(
      page.getByRole("combobox", { name: "Trạng thái buổi", exact: true }),
      "completed",
    );
    await chooseOption(
      page.getByRole("combobox", {
        name: "Trạng thái thanh toán",
        exact: true,
      }),
      "unpaid",
    );
    await expect(page.locator(".status-unpaid")).toHaveText(["Chưa thu"]);
    await expect(
      page.getByRole("link", { name: "Lan gốc", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(
      page.getByRole("link", { name: "Lan gốc", exact: true }),
    ).toHaveCount(3);
    await page.getByLabel("Đến ngày").fill("2000-01-01");
    await expect(
      page.getByText("Không có buổi phù hợp với bộ lọc."),
    ).toBeVisible();
    await page.getByLabel("Từ ngày").fill(vietnamToday());
    await expect(
      page.getByText("Khoảng ngày không hợp lệ.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
    await expect(page.getByLabel("Từ ngày")).toHaveValue(vietnamToday());
    await expect(page.getByLabel("Đến ngày")).toHaveValue(vietnamToday());
    await expect(
      page.getByRole("link", { name: "Lan gốc", exact: true }),
    ).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/session-filters-mobile.png",
      fullPage: true,
    });
  } finally {
    await db.terminate();
  }
});
