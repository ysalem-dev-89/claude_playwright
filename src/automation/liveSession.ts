import { randomUUID } from "node:crypto";
import { chromium, Browser, Page as PWPage } from "playwright";
import { Stagehand, Page as SHPage } from "@browserbasehq/stagehand";
import { FillStrategy } from "../types";
import { resolveChromiumExecutablePath } from "./browserPath";
import { LIVE_VIEW_VIEWPORT } from "./liveView";

export type LiveSession =
  | { id: string; strategy: "heuristic"; page: PWPage; browser: Browser; stagehand?: undefined; lastUsed: number }
  | { id: string; strategy: "ai"; page: SHPage; stagehand: Stagehand; browser?: undefined; lastUsed: number };

const sessions = new Map<string, LiveSession>();
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export async function createSession(strategy: FillStrategy, jobUrl: string): Promise<LiveSession> {
  const id = randomUUID();

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
    await stagehand.page.goto(jobUrl, { waitUntil: "domcontentloaded" });
    const session: LiveSession = { id, strategy: "ai", page: stagehand.page, stagehand, lastUsed: Date.now() };
    sessions.set(id, session);
    return session;
  }

  const browser = await chromium.launch({ executablePath: resolveChromiumExecutablePath(), headless: true });
  const page = await browser.newPage({ viewport: LIVE_VIEW_VIEWPORT });
  await page.goto(jobUrl, { waitUntil: "domcontentloaded" });
  const session: LiveSession = { id, strategy: "heuristic", page, browser, lastUsed: Date.now() };
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
