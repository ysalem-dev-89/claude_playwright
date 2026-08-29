import type { Page } from "playwright";

/** Clicks the mock job page's submit button. Shared by both fill strategies and the manual "Submit" action. */
export async function clickSubmit(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^submit(\s+application)?$/i }).click();
}

export async function waitForConfirmation(page: Page, timeoutMs = 8000): Promise<string> {
  await page.locator("#confirmation-panel").waitFor({ state: "visible", timeout: timeoutMs });
  return page.locator("#confirmation-panel").innerText();
}

export async function readConfirmationIfVisible(page: Page): Promise<string | undefined> {
  const panel = page.locator("#confirmation-panel");
  const visible = await panel.isVisible().catch(() => false);
  return visible ? panel.innerText() : undefined;
}
