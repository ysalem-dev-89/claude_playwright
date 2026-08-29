import { ApplicantProfile, FillStrategy, RunEvent } from "../types";
import { RunLogger, FrameEmitter } from "./logger";
import { runHeuristicApplication } from "./heuristicStrategy";
import { runAiApplication } from "./stagehandStrategy";

export async function runApplication(
  profile: ApplicantProfile,
  strategy: FillStrategy,
  baseUrl: string,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const log: RunLogger = (level, message) => emit({ type: "log", level, message, timestamp: Date.now() });
  const frame: FrameEmitter = (jpegBuffer) =>
    emit({ type: "frame", imageDataUrl: `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`, timestamp: Date.now() });

  const jobUrl = `${baseUrl}/mock-job.html`;

  log("info", `Strategy selected: ${strategy === "ai" ? "AI (Stagehand + Claude)" : "Heuristic (Playwright only, no AI)"}`);

  try {
    const result =
      strategy === "ai"
        ? await runAiApplication(profile, jobUrl, log, frame)
        : await runHeuristicApplication(profile, jobUrl, log, frame);

    log("success", result.message);
    emit({ type: "done", success: result.success, message: result.message, confirmationText: result.confirmationText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", message);
    emit({ type: "done", success: false, message });
  }
}
