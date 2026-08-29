import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApplicantProfile, FillStrategy, RunEvent } from "../types";
import { RunLogger } from "./logger";
import { runHeuristicApplication } from "./heuristicStrategy";
import { runAiApplication } from "./stagehandStrategy";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "public", "screenshots");

export async function runApplication(
  profile: ApplicantProfile,
  strategy: FillStrategy,
  baseUrl: string,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const log: RunLogger = (level, message) => emit({ type: "log", level, message, timestamp: Date.now() });

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const fileName = `${randomUUID()}.png`;
  const screenshotPath = path.join(SCREENSHOT_DIR, fileName);
  const jobUrl = `${baseUrl}/mock-job.html`;

  log("info", `Strategy selected: ${strategy === "ai" ? "AI (Stagehand + Claude)" : "Heuristic (Playwright only, no AI)"}`);

  try {
    const result =
      strategy === "ai"
        ? await runAiApplication(profile, jobUrl, screenshotPath, log)
        : await runHeuristicApplication(profile, jobUrl, screenshotPath, log);

    log("success", result.message);
    emit({
      type: "done",
      success: result.success,
      message: result.message,
      screenshotUrl: `/screenshots/${fileName}`,
      confirmationText: result.confirmationText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", message);
    emit({ type: "done", success: false, message });
  }
}
