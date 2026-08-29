import fs from "node:fs";

const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";

/**
 * Some environments (e.g. this project's cloud dev sandbox) ship a pre-installed Chromium
 * binary at a fixed path instead of the one Playwright would normally download. Use it only
 * when present; everywhere else (a real local machine) fall back to Playwright's own browser
 * resolution, which expects `npx playwright install chromium` to have been run.
 */
export function resolveChromiumExecutablePath(): string | undefined {
  return fs.existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined;
}
