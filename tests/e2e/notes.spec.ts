import { expect, test } from "@playwright/test";

test("notes share filters, actions and selection with the four workspace lists", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "chotcong_locale", value: "en", domain: "localhost", path: "/" },
  ]);
  for (const tab of ["students", "classes", "sessions", "statements"]) {
    await page.goto(`/demo/${tab}`);
    const notes = page.getByRole("button", { name: "Notes", exact: true });
    await expect(notes).toHaveAttribute("aria-pressed", "true");
    const papers = page.locator("article[data-note-color]");
    await expect(papers.first()).toBeVisible();
    const count = await papers.count();
    expect(count).toBeGreaterThan(1);
    expect(
      new Set(
        await papers.evaluateAll((items) =>
          items.map((item) => getComputedStyle(item).backgroundColor),
        ),
      ).size,
    ).toBeGreaterThan(1);
    await expect(page.locator(".record-note-pin")).toHaveCount(count);
    await expect(papers.first().locator(".record-note-pin")).toHaveCSS(
      "fill",
      "rgb(239, 51, 79)",
    );
    expect(
      await papers
        .first()
        .locator(".record-note-pin")
        .evaluate((pin) => parseFloat(getComputedStyle(pin).width)),
    ).toBeGreaterThan(24);
    await expect(papers.first()).toHaveCSS("animation-name", "note-sway");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(papers.first()).toHaveCSS("animation-name", "none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (tab === "students" || tab === "classes") {
      const first = papers.first();
      const name = (await first.locator("a").first().innerText()).split(
        "\n",
      )[0];
      const search = page.getByRole("searchbox");
      await search.fill(name);
      await expect(papers).toHaveCount(1);
      await first.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
    if (tab === "sessions") {
      await page
        .getByRole("combobox", { name: "Lesson status", exact: true })
        .click();
      await page.getByRole("option", { name: "Planned", exact: true }).click();
      await page.getByRole("button", { name: "Select", exact: true }).click();
      await page.getByRole("checkbox", { name: "All", exact: true }).click();
      const complete = page.getByRole("button", {
        name: /^Mark completed \([1-9]\d*\)$/,
      });
      await expect(complete).toBeEnabled();
      await complete.click();
      await expect(papers).toHaveCount(0);
    }
    if (tab === "statements") {
      await papers.first().getByRole("link").click();
      await expect(page).toHaveURL(/\/demo\/statements\/[^/]+$/);
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});
