import { expect, test } from "@playwright/test";

for (const platform of ["iOS", "Android"]) {
  test(`${platform} demo uses native chrome, compact forms and tab navigation without an account`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: `Mozilla/5.0 LessonBrookApp/${platform} NativeWorkspace/1 MobileActions/1 NativeChrome/1`,
      viewport: { width: 390, height: 650 },
    });
    await context.addCookies([
      { name: "chotcong_locale", value: "en", domain: "localhost", path: "/" },
    ]);
    const page = await context.newPage();
    const privateRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/") && !path.startsWith("/api/demo"))
        privateRequests.push(path);
    });
    try {
      await page.goto("/demo");
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
        "content",
        /maximum-scale=1.*user-scalable=no/,
      );
      await expect(page.locator('[data-slot="workspace-header"]')).toHaveCount(
        0,
      );
      await expect(page.locator('nav[data-position="bottom"]')).toHaveCount(0);
      await expect(page.locator('[data-slot="demo-toolbar"]')).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Sign in", exact: true }),
      ).toHaveAttribute("href", "/login");
      await expect(page.locator("#main")).toHaveCSS("padding-bottom", "12px");
      const tuition = page.getByText("Outstanding tuition", { exact: true });
      await expect(tuition).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Outstanding tuition" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Record (a )?lesson/ }),
      ).toHaveCount(0);
      const active = page.getByText("Active students", { exact: true });
      const upcoming = page.getByRole("heading", {
        name: "Upcoming lessons",
        exact: true,
      });
      await expect(upcoming).toBeVisible();
      expect((await upcoming.boundingBox())!.y).toBeGreaterThan(
        (await active.boundingBox())!.y,
      );
      const scheduleCard = page.getByTestId("upcoming-lesson-list");
      await expect(scheduleCard.getByRole("heading")).toHaveText(
        "Upcoming lessons",
      );
      const rows = scheduleCard.locator("[data-list-tone]");
      await expect(rows.first()).toBeVisible();
      await expect(rows.first()).toHaveAttribute("data-list-tone", "blue");
      await expect(rows.first().locator(".record-identity")).toBeVisible();
      const marker = await page.evaluate(() => {
        (window as Window & { demoVisit?: string }).demoVisit = "kept";
        return !window.dispatchEvent(
          new CustomEvent("lessonbrook:navigate-tab", {
            cancelable: true,
            detail: "/app/students",
          }),
        );
      });
      expect(marker).toBe(true);
      await expect(page).toHaveURL(/\/demo\/students$/);
      await expect(
        page.locator("article[data-note-color]").first(),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Add student", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const field = dialog.locator('[data-slot="input"]').first();
      await expect(field).toHaveCSS("font-size", "16px");
      expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(dialog.locator("form")).toHaveCSS("padding", "12px");
      await page
        .getByRole("button", { name: "Close form", exact: true })
        .click();
      for (const path of [
        "/app/classes",
        "/app/sessions",
        "/app/statements",
        "/app",
      ]) {
        await page.evaluate(
          (target) =>
            window.dispatchEvent(
              new CustomEvent("lessonbrook:navigate-tab", {
                cancelable: true,
                detail: target,
              }),
            ),
          path,
        );
        await expect(page).toHaveURL(
          new RegExp(path.replace("/app", "/demo") + "$"),
        );
        await expect(page.locator("#main h1")).toBeVisible();
        if (path === "/app/sessions") {
          const buttons = page.locator(
            '[data-layout="lesson-filter-actions"] button',
          );
          await expect(buttons).toHaveText([
            "Today",
            "This month",
            "Clear filters",
            "Select",
          ]);
          const positions = await buttons.evaluateAll((items) =>
            items.map((item) => item.getBoundingClientRect().top),
          );
          expect(new Set(positions).size).toBe(1);
        }
        if (path === "/app/classes" || path === "/app/sessions") {
          await page
            .getByRole("button", { name: "Month calendar", exact: true })
            .click();
          const calendar = page.getByRole("region", {
            name: "Month calendar",
            exact: true,
          });
          const event = calendar
            .locator('[data-slot="calendar-event"]')
            .first();
          await expect(event).toBeVisible();
          const time = event.locator(".calendar-event-time");
          const title = event.locator(".calendar-event-title");
          await expect(time).toHaveText(/^(\d{2}:\d{2}|—)$/);
          await expect(title).toBeVisible();
          expect((await title.boundingBox())!.y).toBeGreaterThan(
            (await time.boundingBox())!.y,
          );
          await event.click();
          await expect(
            calendar
              .getByLabel("Selected day details")
              .getByRole("link")
              .first(),
          ).toBeVisible();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      for (const target of [
        "/app/settings",
        "/app/appearance",
        "/app/students",
      ]) {
        const accepted = await page.evaluate(
          (detail) =>
            !window.dispatchEvent(
              new CustomEvent("lessonbrook:navigate-tab", {
                cancelable: true,
                detail,
              }),
            ),
          target,
        );
        expect(accepted).toBe(true);
        await expect(page).toHaveURL(
          new RegExp(target.replace("/app", "/demo") + "$"),
        );
        await expect(
          page.locator("#main").getByRole("heading").first(),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => (window as Window & { demoVisit?: string }).demoVisit,
        ),
      ).toBe("kept");
      expect(privateRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
