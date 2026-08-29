import path from "node:path";
import { chromium } from "playwright";
import { ApplicantProfile } from "../types";
import { RunLogger, FrameEmitter } from "./logger";
import { resolveChromiumExecutablePath } from "./browserPath";
import { LIVE_VIEW_VIEWPORT, captureFrame } from "./liveView";

export interface StrategyResult {
  success: boolean;
  message: string;
  confirmationText?: string;
}

interface SelectField {
  kind: "select";
  labelPattern: RegExp;
  value: string | undefined;
}
interface TextField {
  kind: "text";
  labelPattern: RegExp;
  value: string | undefined;
}
type Field = SelectField | TextField;

// Heuristic fills happen near-instantly; pause briefly after each step so the live view is
// actually watchable instead of flashing by in a single frame.
const STEP_PAUSE_MS = 200;

/**
 * Deterministic, non-AI baseline: matches each form field to a profile value purely by the
 * <label> text Playwright's accessible-name matching finds. No LLM involved — this is the
 * "traditional Playwright" approach, useful as a contrast against the AI (Stagehand) strategy.
 */
export async function runHeuristicApplication(
  profile: ApplicantProfile,
  jobUrl: string,
  log: RunLogger,
  frame: FrameEmitter,
): Promise<StrategyResult> {
  log("info", "Launching local Chromium via Playwright (no AI involved in this mode)...");
  const browser = await chromium.launch({ executablePath: resolveChromiumExecutablePath(), headless: true });

  try {
    const page = await browser.newPage({ viewport: LIVE_VIEW_VIEWPORT });
    log("info", `Navigating to job application form: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "domcontentloaded" });
    await captureFrame(page, frame);

    const fields: Field[] = [
      { kind: "text", labelPattern: /^first name/i, value: profile.personal.firstName },
      { kind: "text", labelPattern: /^last name/i, value: profile.personal.lastName },
      { kind: "text", labelPattern: /^email/i, value: profile.personal.email },
      { kind: "text", labelPattern: /^phone/i, value: profile.personal.phone },
      { kind: "text", labelPattern: /current location/i, value: profile.personal.location },
      { kind: "text", labelPattern: /cover letter/i, value: profile.coverLetter },
      { kind: "text", labelPattern: /linkedin profile/i, value: profile.links.linkedin },
      { kind: "text", labelPattern: /website \/ portfolio/i, value: profile.links.portfolio },
      { kind: "text", labelPattern: /^github/i, value: profile.links.github },
      { kind: "text", labelPattern: /desired salary/i, value: profile.additionalInfo.desiredSalary },
      { kind: "text", labelPattern: /earliest start date/i, value: profile.additionalInfo.availableStartDate },
      {
        kind: "select",
        labelPattern: /legally authorized to work/i,
        value: profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No",
      },
      {
        kind: "select",
        labelPattern: /visa sponsorship/i,
        value: profile.workAuthorization.requiresSponsorship ? "Yes" : "No",
      },
      { kind: "select", labelPattern: /how did you hear/i, value: profile.additionalInfo.howDidYouHear },
      { kind: "select", labelPattern: /^gender/i, value: profile.eeoc.gender },
      { kind: "select", labelPattern: /race \/ ethnicity/i, value: profile.eeoc.raceEthnicity },
      { kind: "select", labelPattern: /veteran status/i, value: profile.eeoc.veteranStatus },
      { kind: "select", labelPattern: /disability status/i, value: profile.eeoc.disabilityStatus },
    ];

    for (const field of fields) {
      if (!field.value) continue;
      try {
        const locator = page.getByLabel(field.labelPattern);
        if (field.kind === "text") {
          await locator.fill(field.value);
          log("info", `Filled "${field.labelPattern.source}" → "${field.value}"`);
        } else {
          await locator.selectOption({ label: field.value });
          log("info", `Selected "${field.value}" for "${field.labelPattern.source}"`);
        }
        await page.waitForTimeout(STEP_PAUSE_MS);
        await captureFrame(page, frame);
      } catch (err) {
        log("warn", `Could not match a field for "${field.labelPattern.source}" — skipping (${(err as Error).message.split("\n")[0]})`);
      }
    }

    const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
    log("info", `Uploading resume: ${profile.resume.fileName}`);
    await page.getByLabel(/resume\/cv/i).setInputFiles(resumePath);
    await page.waitForTimeout(STEP_PAUSE_MS);
    await captureFrame(page, frame);

    log("info", "Submitting application...");
    await page.getByRole("button", { name: /submit application/i }).click();

    await page.locator("#confirmation-panel").waitFor({ state: "visible", timeout: 5000 });
    const confirmationText = await page.locator("#confirmation-panel").innerText();
    await captureFrame(page, frame);

    return {
      success: true,
      message: "Application submitted successfully using the heuristic (non-AI) strategy.",
      confirmationText,
    };
  } finally {
    await browser.close();
  }
}
