import { expect, test } from "@playwright/test";
import { Firestore } from "firebase-admin/firestore";
import { googleToken, origin } from "../integration/helpers";
import { vietnamToday } from "../../src/domain";
import { monthBounds } from "../../src/domain/month-calendar";
import { chooseOption } from "./select";

test("360px: monthly classes and lessons load all pages, filter automatically, and open detail without overflow", async ({
  page,
  context,
}) => {
  const token = await googleToken();
  const { token: csrf } = await (
    await context.request.get("/api/auth/csrf")
  ).json();
  const headers = { Origin: origin, "x-csrf-token": csrf };
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers,
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBe(true);
  async function create(path: string, data: unknown) {
    const response = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const today = vietnamToday();
  const { from } = monthBounds(today.slice(0, 7));
  const student = await create("/api/students", {
    displayName: "Calendar Alex",
    defaultRateVnd: 200000,
  });
  const second = await create("/api/students", {
    displayName: "Calendar Blair",
    defaultRateVnd: 200000,
  });
  const teachingClass = await create("/api/classes", {
    displayName: "Calendar Piano",
    studentIds: [student.id, second.id],
    rateVnd: 200000,
    weeklySchedule: [
      {
        weekday: new Date(`${from}T00:00:00Z`).getUTCDay() || 7,
        time: "20:00",
      },
    ],
  });
  const session = await create("/api/sessions", {
    studentId: student.id,
    sessionDate: from,
    startTime: "18:00",
    status: "planned",
    billable: true,
  });
  const db = new Firestore({
    projectId: "demo-chotcong",
    host: process.env.FIRESTORE_EMULATOR_HOST!,
    ssl: false,
  });
  try {
    const collection = db.collection(
      `apps/chotcong/users/${token.uid}/sessions`,
    );
    const template = (await collection.doc(session.id).get()).data()!;
    const batch = db.batch();
    for (let i = 0; i < 54; i++)
      batch.create(collection.doc(`calendar-${i}`), template);
    await batch.commit();
    // A shared lesson has two attendance rows, but only one calendar event.
    const lesson = await create("/api/lessons", {
      classId: teachingClass.id,
      studentIds: [student.id, second.id],
      rateVnd: 200000,
      sessionDate: from,
      startTime: "20:00",
      status: "completed",
      billable: true,
    });
    await page.goto("/app/sessions");
    await page.getByRole("button", { name: "Lịch tháng", exact: true }).click();
    const calendar = page.getByRole("region", {
      name: "Lịch tháng",
      exact: true,
    });
    await expect(calendar.getByRole("status")).toContainText(
      "56 mục trong tháng",
    );
    await calendar.locator(`[data-date="${from}"]`).click();
    const agenda = calendar.getByLabel("Chi tiết ngày đã chọn");
    await expect(agenda.getByRole("link")).toHaveCount(56);
    await chooseOption(
      page.getByRole("combobox", { name: "Trạng thái buổi", exact: true }),
      "completed",
    );
    await expect(calendar.getByRole("status")).toContainText(
      "1 mục trong tháng",
    );
    await expect(agenda.getByRole("link")).toHaveCount(1);
    await expect(agenda.getByText("2 học viên", { exact: true })).toBeVisible();
    await calendar
      .getByRole("button", { name: "Tháng sau", exact: true })
      .click();
    await expect(calendar.getByRole("status")).toContainText(
      "0 mục trong tháng",
    );
    await calendar
      .getByRole("button", { name: "Tháng này", exact: true })
      .click();
    await expect(calendar.getByRole("status")).toContainText(
      "1 mục trong tháng",
    );
    await calendar.locator(`[data-date="${from}"]`).click();
    await agenda.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/app/lessons/${lesson.id}$`));
    await page.goto("/app/classes");
    await page.getByRole("button", { name: "Lịch tháng", exact: true }).click();
    await expect(calendar.getByRole("status")).toContainText("mục trong tháng");
    await calendar.locator(`[data-date="${from}"]`).click();
    await expect(
      agenda.getByRole("link", { name: /Calendar Piano/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await agenda.getByRole("link", { name: /Calendar Piano/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/classes/${teachingClass.id}$`),
    );
  } finally {
    await db.terminate();
  }
});

test("demo uses the same English monthly calendar and keeps detail links in the demo", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "chotcong_locale", value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/demo/classes");
  await page
    .getByRole("button", { name: "Month calendar", exact: true })
    .click();
  const calendar = page.getByRole("region", {
    name: "Month calendar",
    exact: true,
  });
  await expect(calendar.getByRole("status")).toContainText("events this month");
  const day = calendar
    .locator("button[data-date]")
    .filter({ has: page.locator("[data-calendar-tone]") })
    .first();
  await day.click();
  const link = calendar
    .getByLabel("Selected day details")
    .getByRole("link")
    .first();
  await expect(link).toHaveAttribute("href", /^\/demo\/classes\//);
  await link.click();
  await expect(page).toHaveURL(/\/demo\/classes\//);
  await page.goto("/demo/sessions");
  await page
    .getByRole("button", { name: "Month calendar", exact: true })
    .click();
  await expect(calendar.getByRole("status")).toContainText("events this month");
  await calendar
    .locator("button[data-date]")
    .filter({ has: page.locator("[data-calendar-tone]") })
    .first()
    .click();
  await expect(
    calendar.getByLabel("Selected day details").getByRole("link").first(),
  ).toHaveAttribute("href", /^\/demo\/(sessions|lessons)\//);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
