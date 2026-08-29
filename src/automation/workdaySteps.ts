import { RunLogger } from "./logger";

interface Waitable {
  locator(selector: string): { waitFor(options: { state: "visible"; timeout: number }): Promise<void> };
}

/** Waits for a step of the Workday wizard to become visible after a "Save and Continue" click. */
export async function waitForWorkdayScreen(page: Waitable, screenId: string, log: RunLogger): Promise<void> {
  await page
    .locator(`#screen-${screenId}`)
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() =>
      log("warn", `Expected to reach the "${screenId}" step but it never appeared — the target page's flow may differ from this app's mock.`),
    );
}
