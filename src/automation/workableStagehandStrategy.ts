import path from "node:path";
import type { Page } from "@browserbasehq/stagehand";
import { ApplicantProfile } from "../types";
import { RunLogger } from "./logger";

const STEP_PAUSE_MS = 250;

async function act(page: Page, instruction: string, log: RunLogger): Promise<void> {
  log("info", `AI action: ${instruction}`);
  try {
    await page.act(instruction);
  } catch (err) {
    log("warn", `AI could not complete: "${instruction}" (${(err as Error).message.split("\n")[0]})`);
  }
  await page.waitForTimeout(STEP_PAUSE_MS);
}

/**
 * AI-powered strategy: describes each field/action in plain English so it can generalize to a
 * real Workable employer's actual wording and custom screening questions, instead of relying
 * on this app's own mock field ids like workableStrategy.ts does.
 */
export async function fillWorkableApplicationAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  const applyBtn = page.getByRole("button", { name: /apply now/i });
  if (await applyBtn.isVisible().catch(() => false)) {
    await act(page, "Click the Apply now button", log);
  }

  await act(page, `Type "${profile.personal.firstName} ${profile.personal.lastName}" into the Full Name field`, log);
  await act(page, `Type "${profile.personal.email}" into the Email field`, log);
  await act(page, `Type "${profile.personal.phone}" into the Phone field`, log);
  if (profile.coverLetter) await act(page, `Type the following into the Cover Letter field: "${profile.coverLetter}"`, log);
  if (profile.links.linkedin) await act(page, `Type "${profile.links.linkedin}" into the LinkedIn field`, log);
  if (profile.links.portfolio) await act(page, `Type "${profile.links.portfolio}" into the Portfolio/Website field`, log);

  await act(page, `Select "${profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No"}" in the dropdown asking about legal work authorization`, log);
  await act(page, `Select "${profile.workAuthorization.requiresSponsorship ? "Yes" : "No"}" in the dropdown asking about visa sponsorship`, log);
  if (profile.additionalInfo.desiredSalary) await act(page, `Type "${profile.additionalInfo.desiredSalary}" into the salary expectations field`, log);
  if (profile.additionalInfo.howDidYouHear) await act(page, `Select "${profile.additionalInfo.howDidYouHear}" in the "How did you hear about this job?" dropdown`, log);

  await act(page, `Select "${profile.eeoc.gender}" in the Gender dropdown`, log);
  await act(page, `Select "${profile.eeoc.raceEthnicity}" in the Race/Ethnicity dropdown`, log);
  await act(page, `Select "${profile.eeoc.veteranStatus}" in the Veteran status dropdown`, log);
  await act(page, `Select "${profile.eeoc.disabilityStatus}" in the Disability status dropdown`, log);

  const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
  log("info", `Uploading resume via direct Playwright call: ${profile.resume.fileName}`);
  await page.getByLabel(/resume\/cv/i).setInputFiles(resumePath);
  await page.waitForTimeout(STEP_PAUSE_MS);
}
