import { expect, test } from "@playwright/test";
import { googleToken, origin } from "../integration/helpers";
import { vietnamToday } from "../../src/domain";

test.use({ locale: "vi-VN", storageState: { cookies: [], origins: [] } });

test("demo reuses the workspace and keeps sample changes in its tab", async ({
  page,
  context,
}) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) businessRequests.push(path);
  });
  await page.goto("/");
  await page.getByRole("link", { name: "View demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Have a good teaching day." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent lessons" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Demo navigation" });
  await expect(nav).toHaveAttribute("data-position", "bottom");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(nav).toHaveAttribute("data-position", "sidebar");
  for (const [tab, path, heading] of [
    ["Students", "students", "Your students"],
    ["Classes", "classes", "Class list"],
    ["Lessons", "sessions", "Lesson list"],
    ["Statements", "statements", "Tuition statements"],
  ] as const) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/demo/${path}$`));
    await expect(
      nav.getByRole("link", { name: tab, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Notes", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "List", exact: true }).click();
    const coloredRow = page.locator("[data-list-tone]").first();
    await expect(coloredRow).toBeVisible();
    await expect(coloredRow).toHaveCSS("background-image", /linear-gradient/);
  }
  const statementDate = page.getByRole("combobox", { name: "Statement date" });
  const dateMenu = page.getByRole("listbox", { name: "Statement date" });
  await statementDate.click();
  await expect(dateMenu.getByRole("option")).toHaveText([
    "All time",
    "Today",
    "This week",
    "This month",
    "Custom",
  ]);
  await dateMenu.getByRole("option", { name: "Today", exact: true }).click();
  await expect(page.locator("[data-list-tone]")).toHaveCount(1);
  await expect(page.getByText(/^Created:/)).toBeVisible();
  await statementDate.click();
  await dateMenu.getByRole("option", { name: "Custom", exact: true }).click();
  await page.getByLabel("To date").fill("2000-01-01");
  await expect(page.getByText("No statements in this list yet.")).toBeVisible();
  await nav.getByRole("link", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Add student" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Student name").fill("Demo Test Student");
  await expect(dialog.getByLabel("Default price / lesson")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save student" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Find a student" })
    .fill("Demo Test Student");
  await expect(
    page.getByRole("link", { name: "Demo Test Student" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Demo Test Student" }).click();
  await expect(page).toHaveURL(/\/demo\/students\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Demo Test Student" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Demo Test Student" }),
  ).toHaveCount(0);
  expect([...new Set(businessRequests)]).toEqual(["/api/demo"]);

  const { token } = await (await context.request.get("/api/auth/csrf")).json();
  const { idToken } = await googleToken();
  const session = await context.request.post("/api/auth/session", {
    headers: { Origin: origin, "x-csrf-token": token },
    data: { idToken },
  });
  expect(session.ok()).toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
    "content",
    /user-scalable=no|maximum-scale=1/,
  );
});

test("native workspace opens account tools, planned lessons and filtered statements", async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 LessonBrookApp/Android NativeWorkspace/1 NativeChrome/1",
    viewport: { width: 390, height: 800 },
  });
  try {
    const { token } = await (
      await context.request.get(`${origin}/api/auth/csrf`)
    ).json();
    const { idToken } = await googleToken();
    const session = await context.request.post(`${origin}/api/auth/session`, {
      headers: { Origin: origin, "x-csrf-token": token },
      data: { idToken },
    });
    expect(session.ok()).toBeTruthy();
    const page = await context.newPage();
    await page.goto(`${origin}/app/settings`);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /maximum-scale=1.*user-scalable=no/,
    );
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await expect(page.locator('[data-slot="workspace-header"]')).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Language" }),
    ).toBeVisible();
    const lastAction = page.getByRole("button", {
      name: "Sign out all devices",
      exact: true,
    });
    await expect(lastAction).toBeVisible();
    await expect
      .poll(() =>
        lastAction.evaluate((element) => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return window.innerHeight - element.getBoundingClientRect().bottom;
        }),
      )
      .toBeGreaterThanOrEqual(24);
    const create = async (path: string, data: unknown) => {
      const result = await context.request.post(`${origin}${path}`, {
        headers: {
          Origin: origin,
          "x-csrf-token": token,
          "Idempotency-Key": crypto.randomUUID(),
        },
        data,
      });
      expect(result.ok()).toBeTruthy();
      return result.json();
    };
    const student = await create("/api/students", {
      displayName: "Alex Schedule",
      defaultRateVnd: 200000,
    });
    const lesson = await create("/api/sessions", {
      studentId: student.id,
      sessionDate: vietnamToday(),
      startTime: "09:00",
      status: "planned",
      billable: true,
    });
    await page.goto(`${origin}/app/schedule`);
    await page.getByRole("link", { name: /Alex Schedule/ }).click();
    await expect(page).toHaveURL(`${origin}/app/sessions/${lesson.id}`);
    await page.getByRole("button", { name: "Mark complete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("form")).toHaveAttribute(
      "data-mobile-draft",
      "dirty",
    );
    await dialog
      .getByRole("button", { name: "Save lesson", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const saved = await context.request.get(
      `${origin}/api/sessions/${lesson.id}`,
    );
    expect(await saved.json()).toMatchObject({
      status: "completed",
      rateVnd: 200000,
    });
    await page.goto(`${origin}/app/statements?status=overdue`);
    await expect(
      page.getByRole("combobox", { name: "Statement status" }),
    ).toHaveText("Overdue");
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    const switchTab = (path: string) =>
      page.evaluate(
        (detail) =>
          !window.dispatchEvent(
            new CustomEvent("lessonbrook:navigate-tab", {
              cancelable: true,
              detail,
            }),
          ),
        path,
      );
    expect(await switchTab("/login")).toBe(false);
    expect(await switchTab("/app/classes")).toBe(true);
    await expect(page).toHaveURL(`${origin}/app/classes`);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(
      documentStart,
    );
  } finally {
    await context.close();
  }
});

test("configured iOS presents the native Google action while Android keeps browser sign-in", async ({
  browser,
}) => {
  const mobile = [
    {
      agent: "LessonBrookApp/iOS NativeGoogleSignIn/1",
      label: "Continue with Google",
    },
    {
      agent: "LessonBrookApp/Android",
      label: "Sign in with Google in browser",
    },
  ];
  for (const { agent, label } of mobile) {
    const context = await browser.newContext({
      userAgent: `Mozilla/5.0 ${agent}`,
    });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/login`);
      await expect(page.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        "tech.devoralabs.lessonbrook://start",
      );
    } finally {
      await context.close();
    }
  }
});

test("visitors can preview themes on the home page without saving an account preference", async ({
  page,
}) => {
  const appearanceRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/appearance")
      appearanceRequests.push(request.method());
  });

  await page.goto("/");
  const theme = page.getByRole("combobox", { name: "Preview theme" });
  const home = page.getByRole("main");
  await expect(theme).toHaveText("Playful Retro Neo-Brutalism");
  await theme.click();
  const themeMenu = page.getByRole("listbox", { name: "Preview theme" });
  await expect(themeMenu.getByRole("option")).toHaveCount(6);
  await themeMenu
    .getByRole("option", { name: "Afterhours FM", exact: true })
    .click();
  await expect(home).toHaveCSS("background-color", "rgb(16, 16, 16)");
  await expect(home.locator('[data-slot="card"]')).toHaveCSS(
    "background-color",
    "rgb(29, 29, 29)",
  );
  await theme.click();
  await expect(themeMenu).toHaveCSS("background-color", "rgb(29, 29, 29)");
  await expect(themeMenu).toHaveCSS("color", "rgb(250, 249, 243)");
  await themeMenu.getByRole("option", { name: "Sticker Sprint" }).click();
  await page.getByRole("link", { name: "View demo", exact: true }).click();
  const outstanding = page.locator('[data-slot="card"][data-tone="yellow"]');
  const caption = outstanding.getByText(
    "Unpaid balance on all issued statements",
  );
  await expect(caption).toHaveCSS("color", "rgb(17, 17, 17)");
  await expect(caption).toHaveCSS("font-size", "13px");
  await expect(
    outstanding.getByRole("link", { name: "Outstanding" }),
  ).toHaveCSS("font-size", "15px");
  const dashboardTitle = page.getByRole("heading", {
    name: "Have a good teaching day.",
  });
  await expect(dashboardTitle).toHaveCSS("font-size", "25px");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dashboardTitle).toHaveCSS("font-size", "37px");
  const students = page
    .locator('nav[data-position="sidebar"]')
    .getByRole("link", {
      name: "Students",
    });
  await expect(students).toHaveCSS("font-size", "15px");
  await expect(students).toHaveCSS("font-weight", "700");
  await students.click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .locator("[data-list-tone]")
    .first()
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: "Edit student", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(() =>
        dialog.evaluate((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return Math.max(
            Math.abs(x + width / 2 - innerWidth / 2),
            Math.abs(y + height / 2 - innerHeight / 2),
          );
        }),
      )
      .toBeLessThan(1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.goto("/");
  await theme.click();
  await themeMenu
    .getByRole("option", { name: "Playful Retro Neo-Brutalism", exact: true })
    .click();
  await expect(home).toHaveCSS("background-color", "rgb(255, 246, 230)");
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(theme).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }

  await page.reload();
  await expect(theme).toHaveText("Playful Retro Neo-Brutalism");
  await expect(home).toHaveAttribute("data-theme", "playful-retro");
  expect(appearanceRequests).toEqual([]);
});

test("home ledger draws its checks on entry, rearms after leaving, and settles with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const ledger = page.locator('[data-slot="home-ledger"]');
  const check = ledger.locator(".ledger-motion-check").first();
  await expect(ledger).not.toHaveAttribute("data-ledger-motion", "playing");

  const observeDrawing = () =>
    ledger.evaluate(async (panel) => {
      const path = panel.querySelector(".ledger-motion-check")!;
      panel.scrollIntoView({ block: "center" });
      const deadline = performance.now() + 2000;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const offset = Number.parseFloat(
          getComputedStyle(path).strokeDashoffset,
        );
        if (offset > 0 && offset < 1) return true;
      }
      return false;
    });

  expect(await observeDrawing()).toBe(true);
  await expect(check).toHaveCSS("stroke-dashoffset", "0px");
  await page.mouse.wheel(0, 5);
  await expect(check).toHaveCSS("stroke-dashoffset", "0px");

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(ledger).not.toHaveAttribute("data-ledger-motion", "playing");
  expect(await observeDrawing()).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(ledger).not.toHaveAttribute("data-ledger-motion", "playing");
  await expect(check).toHaveCSS("animation-name", "none");
  await expect(ledger.getByText(/Lan · Piano/)).toBeVisible();
});

test("360px: English default, switch persists across routes and reload, metadata and manifest follow locale", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: /Focus on teaching/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Lesson & tuition ledger/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const language = page.getByRole("combobox", {
    name: "Language",
    exact: true,
  });
  // Keep both controls adjacent at phone and desktop widths.
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const picker = (await language.boundingBox())!;
    const signIn = (await page
      .getByRole("link", { name: "Sign in", exact: true })
      .boundingBox())!;
    expect(Math.abs(picker.y - signIn.y)).toBeLessThan(2);
    expect(signIn.x - picker.x - picker.width).toBeGreaterThanOrEqual(7);
    expect(signIn.x - picker.x - picker.width).toBeLessThanOrEqual(16);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await language.focus();
  await language.press("ArrowDown");
  await expect(language).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("option", { name: "English", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await language.press("Escape");
  await expect(language).toHaveAttribute("aria-expanded", "false");
  await expect(language).toBeFocused();
  await language.click();
  await page.getByRole("heading", { name: /Focus on teaching/ }).click();
  await expect(language).toHaveAttribute("aria-expanded", "false");
  await language.press("ArrowDown");
  await language.press("End");
  await expect(language).toHaveAttribute(
    "aria-activedescendant",
    (await page
      .getByRole("option", { name: "Tiếng Việt", exact: true })
      .getAttribute("id"))!,
  );
  await language.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(
    page.getByRole("combobox", { name: "Xem thử giao diện" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Dạy hết mình/ }),
  ).toBeVisible();
  await page.goto("/help#install");
  await expect(
    page.getByRole("heading", { name: "Dùng sổ nhẹ nhàng mỗi ngày" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Ngôn ngữ", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(new URL(page.url()).hash).toBe("#install");
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "The data in your ledger" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    (await (await context.request.get("/manifest.webmanifest")).json()).lang,
  ).toBe("en");
  await page.goto("/login?expired=1");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(page.getByRole("status")).toContainText(
    "Your session has expired",
  );
  const cookie = (await context.cookies()).find(
    (c) => c.name === "chotcong_locale",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(errors).toEqual([]);
});

test("English teacher flow: entered Vietnamese names stay intact, lessons and statements use English and VND", async ({
  page,
  context,
  browser,
}) => {
  const sub = crypto.randomUUID();
  const token = await googleToken(sub);
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
  const create = async (path: string, data: unknown) => {
    const response = await context.request.post(path, {
      headers: {
        ...headers,
        "x-csrf-token": (await context.cookies()).find(
          (cookie) => cookie.name === "chotcong_csrf",
        )!.value,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  await page.goto("/app/settings");
  await page.getByRole("combobox", { name: "Bank name", exact: true }).click();
  await page.getByRole("option", { name: "Vietcombank", exact: true }).click();
  await page
    .getByLabel("Account number", { exact: true })
    .fill("12345678901234");
  await page.getByLabel("Account holder name").fill("DEMO ACCOUNT HOLDER");
  await page
    .getByRole("button", { name: "Save bank transfer details" })
    .click();
  await expect(page.getByText("Bank transfer details saved.")).toBeVisible();
  await page.goto("/app/students");
  await page
    .getByRole("button", { name: "Add student", exact: true })
    .first()
    .click();
  await page.getByLabel("Student name *", { exact: true }).fill("Đã dạy");
  await page.getByLabel("Statement email").fill("guardian@example.test");
  await page.getByRole("button", { name: "Save student", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Student Đã dạy saved." }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Đã dạy/ }).click();
  await expect(
    page.getByRole("heading", { name: "Đã dạy", exact: true }),
  ).toBeVisible();
  const studentUrl = page.url();
  const studentId = studentUrl.split("/").pop()!;
  await page.getByRole("button", { name: "Edit student", exact: true }).click();
  await expect(page.getByLabel("Statement email")).toHaveValue(
    "guardian@example.test",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Record lesson", exact: true })
    .click();
  await page.getByLabel("Lesson date *", { exact: true }).fill(vietnamToday());
  await page.getByLabel("This lesson's price").fill("200000");
  await page.getByRole("button", { name: "Save lesson", exact: true }).click();
  await expect(page.locator(".status-completed")).toHaveText("Completed");
  await expect(page.getByText(/200,000/).last()).toBeVisible();
  const sessions = await (await context.request.get("/api/sessions")).json();
  const statement = await create("/api/statements", {
    studentId,
    sessionIds: [sessions.items[0].id],
    periodStart: vietnamToday(),
    periodEnd: vietnamToday(),
    dueDate: vietnamToday(),
    includeBankDetails: false,
  });
  await page.goto(`/app/statements/${statement.id}`);
  await expect(
    page.getByRole("heading", { name: "Preview draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Issue statement", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /^CC-/ })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "VietQR payment code" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const link = await page
    .getByLabel("New shared link", { exact: true })
    .inputValue();
  await expect(
    page.getByRole("button", { name: "Send email", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Statement email is not enabled for this account."),
  ).toBeVisible();
  const guest = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 360, height: 800 },
  });
  try {
    const recipient = await guest.newPage();
    await recipient.goto(link);
    await expect(recipient.getByTestId("public-statement")).toContainText(
      "TUITION STATEMENT",
    );
    await expect(recipient.getByTestId("public-statement")).not.toContainText(
      "guardian@example.test",
    );
    await expect(recipient.getByTestId("public-statement")).toContainText(
      "Đã dạy",
    );
    await expect(recipient.getByTestId("public-remaining")).toContainText(
      "200,000",
    );
    await expect(
      recipient.getByRole("img", { name: "VietQR payment code" }),
    ).toBeVisible();
    await expect(recipient.getByTestId("public-statement")).toContainText(
      "DEMO ACCOUNT HOLDER",
    );
    await recipient
      .getByRole("combobox", { name: "Language", exact: true })
      .click();
    await recipient
      .getByRole("option", { name: "Tiếng Việt", exact: true })
      .click();
    await expect(recipient.locator("html")).toHaveAttribute("lang", "vi");
    expect(new URL(recipient.url()).hash).toBe(new URL(link).hash);
    await expect(recipient.getByTestId("public-remaining")).toContainText(
      "200.000",
    );
    expect(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await guest.close();
  }
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Bank transfer details" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose a theme", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your appearance" }),
  ).toBeVisible();
  await expect(page.getByLabel("Type DELETE ACCOUNT to confirm")).toBeVisible();
  const saveAppearance = page.getByRole("button", {
    name: "Save appearance",
    exact: true,
  });
  await expect(saveAppearance).toBeDisabled();
  await page
    .getByRole("radio", { name: "Afterhours FM", exact: false })
    .check();
  await expect(page.locator('[data-theme="afterhours-fm"]')).toHaveCSS(
    "background-color",
    "rgb(16, 16, 16)",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Previewing — not saved yet." }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/appearance")).json()).theme,
  ).toBe("playful-retro");
  await page
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await expect(page.locator('[data-theme="playful-retro"]')).toBeVisible();
  await expect(saveAppearance).toBeDisabled();
  await page.getByRole("radio", { name: "Margin Notes", exact: false }).check();
  await expect(page.locator('[data-theme="margin-notes"]')).toBeVisible();
  await expect(
    page.getByText(
      "Warm cream, vivid pastels, bold outlines and retro shadows",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Previewing — not saved yet." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await expect(page.locator('[data-theme="playful-retro"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(saveAppearance).toHaveCount(0);
  await expect(page.getByLabel("Account number", { exact: true })).toHaveValue(
    "12345678901234",
  );
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Create shortcut key", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
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
  await popup.getByText(`${sub}@example.test`, { exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Automatic renewal enabled" }),
  ).toBeVisible();
  const authorization = page.getByLabel("Authorization header value");
  await expect(authorization).toHaveValue(
    /^Bearer [a-f0-9]{64}\.[a-f0-9]{64}$/,
  );
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(authorization).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
