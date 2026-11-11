import type { Locator } from "@playwright/test";

export async function chooseOption(trigger: Locator, value: string) {
  await trigger.click();
  const page = trigger.page();
  await page
    .getByRole("listbox")
    .getByRole("option")
    .and(page.locator(`[data-value=${JSON.stringify(value)}]`))
    .click();
}
