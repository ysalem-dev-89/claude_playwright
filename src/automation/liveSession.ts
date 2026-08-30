import { randomUUID } from "node:crypto";
import { chromium, Browser, Page as PWPage } from "playwright";
import { Stagehand, Page as SHPage } from "@browserbasehq/stagehand";
import { FillStrategy, Platform, PLATFORMS_ALLOWING_REAL_SUBMISSION } from "../types";
import { resolveChromiumExecutablePath } from "./browserPath";
import { LIVE_VIEW_VIEWPORT } from "./liveView";

export type LiveSession =
  | { id: string; strategy: "heuristic"; platform: Platform; hostname: string; page: PWPage; browser: Browser; stagehand?: undefined; isExternal: boolean; lastUsed: number }
  | { id: string; strategy: "ai"; platform: Platform; hostname: string; page: SHPage; stagehand: Stagehand; browser?: undefined; isExternal: boolean; lastUsed: number };

const sessions = new Map<string, LiveSession>();
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Hard, network-level block on ever submitting to a real job posting — not just a UI/API
 * guard. Real submission (whether triggered by our own clickSubmit(), an AI act() call, or a
 * manually forwarded click on the live canvas landing on the page's own Submit button) always
 * goes out as a non-GET request, so aborting every non-GET/HEAD request is a guarantee that
 * holds regardless of what triggered the click. This can also block harmless POSTs the page
 * makes for its own rendering (e.g. an analytics beacon or a GraphQL query sent as POST) —
 * an acceptable trade-off for "never submit" being an actual guarantee rather than best-effort.
 *
 * Only installed when the platform doesn't allow real submission (see
 * PLATFORMS_ALLOWING_REAL_SUBMISSION) — Workable sessions skip this entirely, since real
 * submission there is the point, not something to guard against.
 */
async function blockNonGetRequests(page: PWPage | SHPage): Promise<void> {
  await page.route("**/*", (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") route.continue();
    else route.abort("blockedbyclient");
  });
}

export async function createSession(
  strategy: FillStrategy,
  platform: Platform,
  jobUrl: string,
  isExternal: boolean,
): Promise<LiveSession> {
  const id = randomUUID();
  const hostname = new URL(jobUrl).hostname;
  const blockSubmission = isExternal && !PLATFORMS_ALLOWING_REAL_SUBMISSION.has(platform);

  if (strategy === "ai") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env to start an AI session, or use the Heuristic strategy.");
    }
    const stagehand = new Stagehand({
      env: "LOCAL",
      modelName: (process.env.STAGEHAND_MODEL as never) || "claude-3-7-sonnet-latest",
      modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
      localBrowserLaunchOptions: {
        executablePath: resolveChromiumExecutablePath(),
        headless: true,
        viewport: LIVE_VIEW_VIEWPORT,
      },
      disablePino: true,
      verbose: 0,
    });
    await stagehand.init();
    if (blockSubmission) await blockNonGetRequests(stagehand.page);
    await stagehand.page.goto(jobUrl, { waitUntil: "domcontentloaded" });
    const session: LiveSession = { id, strategy: "ai", platform, hostname, page: stagehand.page, stagehand, isExternal, lastUsed: Date.now() };
    sessions.set(id, session);
    return session;
  }

  const browser = await chromium.launch({ executablePath: resolveChromiumExecutablePath(), headless: true });
  const page = await browser.newPage({ viewport: LIVE_VIEW_VIEWPORT });
  if (blockSubmission) await blockNonGetRequests(page);
  await page.goto(jobUrl, { waitUntil: "domcontentloaded" });
  const session: LiveSession = { id, strategy: "heuristic", platform, hostname, page, browser, isExternal, lastUsed: Date.now() };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): LiveSession | undefined {
  const session = sessions.get(id);
  if (session) session.lastUsed = Date.now();
  return session;
}

export async function closeSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.strategy === "ai") await session.stagehand.close().catch(() => {});
  else await session.browser.close().catch(() => {});
}

// Reap sessions nobody has touched in a while so an abandoned tab doesn't leak a headless browser.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > IDLE_TIMEOUT_MS) closeSession(id);
  }
}, 60_000).unref();
