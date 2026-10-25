import { expect, test, type BrowserContext } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
async function login(context: BrowserContext) {
  const token = await googleToken();
  const csrf = (await (await context.request.get("/api/auth/csrf")).json())
    .token;
  const headers = { Origin: origin, "x-csrf-token": csrf };
  expect(
    (
      await context.request.post("/api/auth/session", {
        headers,
        data: { idToken: token.idToken },
      })
    ).ok(),
  ).toBe(true);
  return async (path: string, data: unknown) => {
    const response = await context.request.post(path, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
}
test("360px: tạo lớp giá chung → chọn người tham gia → retry không nhân đôi → sửa riêng → giá lớp mới giữ buổi cũ", async ({
  page,
  context,
}) => {
  const create = await login(context);
  for (const name of ["Lan", "Minh", "An"])
    await create("/api/students", {
      displayName: name,
      defaultRateVnd: 200000,
    });
  await page.goto("/app/classes");
  await page.getByRole("button", { name: "Thêm lớp học", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên lớp").fill("Piano chiều");
  await dialog.getByLabel("Học phí mỗi học viên").fill("150000");
  for (const name of ["Lan", "Minh", "An"])
    await dialog.getByRole("checkbox", { name, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Lưu lớp học", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Piano chiều", exact: true }),
  ).toBeVisible();
  const classUrl = page.url();
  await page
    .getByRole("link", { name: "Ghi buổi cho lớp", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "An", exact: true }).uncheck();
  await expect(page.getByLabel("Học phí / người")).toHaveValue("150000");
  await expect(page.getByLabel("Học phí / người")).toHaveAttribute(
    "readonly",
    "",
  );
  const keys: string[] = [];
  await page.route("**/api/lessons", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Lưu buổi nhóm/lớp", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nội dung vẫn được giữ" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "An", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Lưu buổi nhóm/lớp", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sửa thông tin chung" }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const lessonUrl = page.url();
  const sessions = await (await context.request.get("/api/sessions")).json();
  expect(sessions.items).toHaveLength(2);
  await expect(
    page.getByText("300.000", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa Minh", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Trạng thái", exact: true })
    .selectOption("cancelled");
  await page.getByRole("button", { name: "Lưu buổi dạy", exact: true }).click();
  await expect(page.getByText("Đã hủy", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Miễn phí", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(classUrl);
  await page.getByRole("button", { name: "Sửa lớp học", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Học phí mỗi học viên")
    .fill("250000");
  await page.getByRole("button", { name: "Lưu lớp học", exact: true }).click();
  await expect(
    page.getByText("250.000", { exact: false }).first(),
  ).toBeVisible();
  await page.goto(lessonUrl);
  await expect(
    page.getByText("Đơn giá đã lưu: 150.000", { exact: false }),
  ).toBeVisible();
  await page.goto("/app/sessions");
  await page.getByRole("button", { name: "Ghi buổi dạy", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Dạy cho").selectOption("group");
  await expect(
    page.getByRole("heading", { name: "Ghi buổi nhóm/lớp", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "An", exact: true }).check();
  await page.getByRole("checkbox", { name: "Lan", exact: true }).check();
  await page.getByLabel("Học phí / người").fill("120000");
  await page
    .getByRole("button", { name: "Lưu buổi nhóm/lớp", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Buổi nhóm tự chọn" }),
  ).toBeVisible();
  await expect(
    page.getByText("240.000", { exact: false }).first(),
  ).toBeVisible();
  const nameBox = await page
    .getByRole("link", { name: "Lan", exact: true })
    .boundingBox();
  expect(nameBox!.height).toBeLessThan(30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/chotcong-024-group-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("dropdown gọn trên desktop/360px, tám theme đổi màu và tồn tại sau tải lại", async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/statements");
  const status = page.getByRole("combobox", {
    name: "Trạng thái bảng kê",
    exact: true,
  });
  await expect(status).toBeVisible();
  const size = await status.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(40);
  expect(size!.height).toBeLessThanOrEqual(46);
  const css = await status.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      appearance: s.appearance,
      position: s.backgroundPosition,
      padding: parseFloat(s.paddingRight),
    };
  });
  expect(css.appearance).toBe("none");
  expect(css.padding).toBeGreaterThanOrEqual(36);
  expect(css.position).toContain("14px");
  await page.screenshot({
    path: "/tmp/chotcong-024-statements-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/app/settings");
  const backgrounds = new Set<string>();
  let savedTheme = "natura";
  let appearanceWrites = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/appearance" &&
      request.method() === "PATCH"
    )
      appearanceWrites++;
  });
  for (const [name, id] of [
    ["Modern", "modern"],
    ["Vintage", "vintage"],
    ["Art", "art"],
    ["Natura", "natura"],
    ["Ocean", "ocean"],
    ["Command Line", "command-line"],
    ["Visual Code", "visual-code"],
    ["Playful Retro Neo-Brutalism", "playful-retro"],
  ]) {
    const writesBeforePreview = appearanceWrites;
    await page.getByRole("radio", { name, exact: false }).check();
    const shell = page.locator(`[data-theme="${id}"]`);
    await expect(shell).toBeVisible();
    expect(appearanceWrites).toBe(writesBeforePreview);
    expect(
      (await (await context.request.get("/api/appearance")).json()).theme,
    ).toBe(savedTheme);
    await page
      .getByRole("button", { name: "Lưu giao diện", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã lưu giao diện." }),
    ).toBeVisible();
    savedTheme = id;
    backgrounds.add(
      await shell.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await page.reload();
    await expect(page.locator(`[data-theme="${id}"]`)).toBeVisible();
    await expect(page.getByRole("radio", { name, exact: false })).toBeChecked();
    // Read persisted colours after reload, outside the save button transition.
    if (
      id === "command-line" ||
      id === "visual-code" ||
      id === "playful-retro"
    ) {
      await expect(shell).toHaveCSS(
        "color-scheme",
        id === "playful-retro" ? "light" : "dark",
      );
      await expect(page.locator('input[name="displayName"]')).toBeVisible();
      const contrast = await shell.evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        function rgb(color: string) {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        }
        function luminance(color: number[]) {
          return color
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        }
        function ratio(a: string, b: string) {
          const x = luminance(rgb(a)),
            y = luminance(rgb(b));
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        }
        const style = getComputedStyle(element);
        const input = getComputedStyle(
          element.querySelector('input[name="displayName"]')!,
        );
        const card = getComputedStyle(
          element.querySelector('[data-slot="card"]')!,
        );
        const button = getComputedStyle(
          Array.from(element.querySelectorAll("button")).find((b) =>
            b.textContent?.includes("Lưu giao diện"),
          )!,
        );
        return {
          body: ratio(style.color, style.backgroundColor),
          muted: ratio(
            style.getPropertyValue("--muted-foreground"),
            card.backgroundColor,
          ),
          input: ratio(input.color, input.backgroundColor),
          action: ratio(button.color, button.backgroundColor),
          font: style.fontFamily,
        };
      });
      for (const [sample, value] of Object.entries({
        body: contrast.body,
        muted: contrast.muted,
        input: contrast.input,
        action: contrast.action,
      }))
        expect(value, `${id}: ${sample} contrast`).toBeGreaterThanOrEqual(4.5);
      if (id === "command-line") expect(contrast.font).toContain("monospace");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(backgrounds.size).toBe(8);
  await page.screenshot({
    path: "/tmp/chotcong-024-theme-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/app/statements");
  const mobileSize = await status.boundingBox();
  expect(mobileSize!.height).toBeLessThanOrEqual(46);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("theme preview is local until Save, resets on cancel/navigation/reload, and survives a failed save", async ({
  page,
  context,
}) => {
  await login(context);
  let writes = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/appearance" &&
      request.method() === "PATCH"
    )
      writes++;
  });
  const stored = async () =>
    (await (await context.request.get("/api/appearance")).json()).theme;
  const shell = (theme: string) => page.locator(`[data-theme="${theme}"]`);
  const save = page.getByRole("button", { name: "Lưu giao diện", exact: true });
  await page.goto("/app/settings");
  await expect(save).toBeDisabled();
  await page.getByRole("radio", { name: "Command Line", exact: false }).check();
  await expect(shell("command-line")).toBeVisible();
  await expect(shell("command-line")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Đang xem trước, chưa lưu." }),
  ).toBeVisible();
  expect(await stored()).toBe("natura");
  expect(writes).toBe(0);
  await page.screenshot({
    path: "/tmp/lessonbrook-public-command-line-preview.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Hủy xem trước", exact: true })
    .click();
  await expect(shell("natura")).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("radio", { name: "Visual Code", exact: false }).check();
  await expect(shell("visual-code")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Điều hướng chính", exact: true })
    .getByRole("link", { name: "Tổng quan", exact: true })
    .click();
  await page.waitForURL("**/app");
  await expect(shell("natura")).toBeVisible();
  await page
    .getByRole("link", { name: "Cài đặt tài khoản", exact: true })
    .click();
  await page.waitForURL("**/app/settings");
  await expect(
    page.getByRole("radio", { name: "Natura", exact: false }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Command Line", exact: false }).check();
  await page.reload();
  await expect(shell("natura")).toBeVisible();
  expect(await stored()).toBe("natura");
  expect(writes).toBe(0);
  let fail = true;
  const keys: string[] = [];
  await page.route("**/api/appearance", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Chưa thể lưu giao diện." }),
      });
    }
    return route.continue();
  });
  await page.getByRole("radio", { name: "Visual Code", exact: false }).check();
  await save.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Chưa thể lưu giao diện." }),
  ).toBeVisible();
  await expect(shell("visual-code")).toBeVisible();
  expect(await stored()).toBe("natura");
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu giao diện." }),
  ).toBeVisible();
  expect(await stored()).toBe("visual-code");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.reload();
  await expect(shell("visual-code")).toBeVisible();
  await expect(save).toBeDisabled();
});

test("Playful Retro: consistent panels, forms and navigation at phone/desktop widths, reduced motion and light statement boundary", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const create = await login(context);
  const student = await create("/api/students", {
    displayName: "Retro Demo",
    defaultRateVnd: 200000,
  });
  const session = await create("/api/sessions", {
    studentId: student.id,
    sessionDate: "2026-10-12",
    status: "completed",
    billable: true,
  });
  const statement = await create("/api/statements", {
    studentId: student.id,
    sessionIds: [session.id],
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    dueDate: "2026-10-31",
    includeBankDetails: false,
  });
  await create(`/api/statements/${statement.id}/issue`, { version: 1 });
  await page.goto("/app/settings");
  await page
    .getByRole("radio", { name: "Playful Retro Neo-Brutalism", exact: false })
    .check();
  const shell = page.locator('[data-theme="playful-retro"]');
  await expect(shell).toBeVisible();
  expect(
    (await (await context.request.get("/api/appearance")).json()).theme,
  ).toBe("natura");
  await page
    .getByRole("button", { name: "Lưu giao diện", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đã lưu giao diện." }),
  ).toBeVisible();
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 1000 });
    for (const route of [
      "/app",
      "/app/students",
      "/app/sessions",
      "/app/classes",
      "/app/lessons",
      "/app/statements",
      "/app/settings",
      "/onboarding",
    ]) {
      await page.goto(route);
      await expect(shell).toHaveCSS("background-color", "rgb(255, 246, 230)");
      await page.evaluate(() => document.fonts.ready);
      expect(
        await shell.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--font-playful").trim(),
        ),
      ).not.toBe("");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}px`,
      ).toBe(true);
    }
    await page.goto("/app");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => Array.from(document.fonts).some(face => face.family === "playfulFont" && face.status === "loaded"))).toBe(true);
    // Only the four summary cards carry these tones; onboarding is a separate mint callout.
    const summary = page.locator(
      '[data-tone="yellow"], [data-tone="pink"], [data-tone="blue"]',
    );
    await expect(summary).toHaveCount(3);
    for (const [tone, color] of [
      ["yellow", "rgb(255, 219, 87)"],
      ["pink", "rgb(255, 183, 206)"],
      ["blue", "rgb(170, 215, 245)"],
    ]) {
      const card = page.locator(`[data-slot="card"][data-tone="${tone}"]`);
      await expect(card).toHaveCSS("background-color", color);
      await expect(card).toHaveCSS("border-top-width", "2px");
      await expect(card).toHaveCSS(
        "box-shadow",
        "rgb(33, 31, 27) 4px 4px 0px 0px",
      );
    }
    await page.screenshot({
      path: `/tmp/lessonbrook-public-retro-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/app/students");
    await page
      .getByRole("button", { name: "Thêm học viên", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCSS("border-top-width", "2px");
    const dialogBox = (await dialog.boundingBox())!;
    expect(Math.abs(dialogBox.x - (width - dialogBox.width) / 2)).toBeLessThanOrEqual(1);
    expect(dialogBox.x).toBeGreaterThanOrEqual(12);
    if (width === 1440) {
      const action = dialog.getByRole("button", { name: "Lưu học viên", exact: true });
      await action.hover();
      await expect(action).toHaveCSS("transform", "matrix(1, 0, 0, 1, -1, -1)");
    }
    await expect(
      dialog.getByLabel("Tên học viên *", { exact: true }),
    ).toHaveCSS("border-top-width", "2px");
    await page.screenshot({
      path: `/tmp/lessonbrook-public-retro-form-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/settings");
  const cancel = page.getByRole("button", {
    name: "Hủy xem trước",
    exact: true,
  });
  const save = page.getByRole("button", { name: "Lưu giao diện", exact: true });
  const profileSave = page.getByRole("button", { name: "Lưu hồ sơ", exact: true });
  await profileSave.hover();
  await expect(profileSave).toHaveCSS("transform", "none");
  await expect(save).toHaveCSS("transform", "none");
  expect(
    await save.evaluate((el) => getComputedStyle(el).transitionProperty),
  ).not.toContain("transform");
  // Leaving the retro theme removes its outlines/shadows, and cancel restores the saved retro preference.
  await page.getByRole("radio", { name: "Natura", exact: false }).check();
  await expect(
    page.locator('[data-theme="natura"] [data-slot="card"]').first(),
  ).toHaveCSS("border-top-width", "1px");
  await cancel.click();
  await expect(shell).toBeVisible();
  await page.goto(`/app/statements/${statement.id}`);
  await page
    .getByRole("button", { name: "Xem trước để tạo link", exact: true })
    .click();
  const publicStatement = page.getByTestId("public-statement");
  await expect(publicStatement).toHaveCSS("color-scheme", "light");
  await expect(publicStatement).toHaveCSS("color", "rgb(37, 58, 48)");
  await expect(publicStatement.locator("h1")).not.toHaveCSS(
    "font-weight",
    "800",
  );
  await expect(publicStatement).toHaveCSS("box-shadow", "none");
  expect(errors).toEqual([]);
});
