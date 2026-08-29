import path from "node:path";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { ApplicantProfile } from "../types";
import { RunLogger, FrameEmitter } from "./logger";
import { StrategyResult } from "./heuristicStrategy";
import { resolveChromiumExecutablePath } from "./browserPath";
import { LIVE_VIEW_VIEWPORT, captureFrame } from "./liveView";

/**
 * AI-powered strategy: describes each field in plain English and lets Stagehand's act()
 * figure out which element to interact with, instead of hardcoding selectors. The resume
 * file upload still goes through the underlying Playwright Page directly (stagehand.page
 * *is* a real Playwright Page under the hood) since native file choosers aren't something
 * act() drives reliably.
 */
export async function runAiApplication(
  profile: ApplicantProfile,
  jobUrl: string,
  log: RunLogger,
  frame: FrameEmitter,
): Promise<StrategyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env file to use the AI strategy, or switch to the Heuristic strategy.",
    );
  }

  log("info", "Booting Stagehand (Playwright + Claude) with a local Chromium instance...");
  const stagehand = new Stagehand({
    env: "LOCAL",
    modelName: (process.env.STAGEHAND_MODEL as never) || "claude-3-7-sonnet-latest",
    modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
    localBrowserLaunchOptions: { executablePath: resolveChromiumExecutablePath(), headless: true, viewport: LIVE_VIEW_VIEWPORT },
    disablePino: true,
    verbose: 0,
  });

  try {
    await stagehand.init();
    const page = stagehand.page;

    log("info", `Navigating to job application form: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "domcontentloaded" });
    await captureFrame(page, frame);

    const instructions: string[] = [
      `Type "${profile.personal.firstName}" into the First Name field`,
      `Type "${profile.personal.lastName}" into the Last Name field`,
      `Type "${profile.personal.email}" into the Email field`,
      `Type "${profile.personal.phone}" into the Phone field`,
    ];
    if (profile.personal.location) instructions.push(`Type "${profile.personal.location}" into the Current Location field`);
    if (profile.coverLetter) instructions.push(`Type the applicant's cover letter into the Cover Letter textarea: "${profile.coverLetter}"`);
    if (profile.links.linkedin) instructions.push(`Type "${profile.links.linkedin}" into the LinkedIn Profile field`);
    if (profile.links.portfolio) instructions.push(`Type "${profile.links.portfolio}" into the Website / Portfolio field`);
    if (profile.links.github) instructions.push(`Type "${profile.links.github}" into the GitHub field`);
    instructions.push(
      `Select "${profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No"}" in the dropdown asking if the applicant is legally authorized to work in the United States`,
      `Select "${profile.workAuthorization.requiresSponsorship ? "Yes" : "No"}" in the dropdown asking about visa sponsorship`,
    );
    if (profile.additionalInfo.desiredSalary) instructions.push(`Type "${profile.additionalInfo.desiredSalary}" into the Desired Salary field`);
    if (profile.additionalInfo.availableStartDate) instructions.push(`Type "${profile.additionalInfo.availableStartDate}" into the Earliest Start Date field`);
    if (profile.additionalInfo.howDidYouHear) instructions.push(`Select "${profile.additionalInfo.howDidYouHear}" in the "How did you hear about this job?" dropdown`);
    instructions.push(
      `Select "${profile.eeoc.gender}" in the Gender dropdown`,
      `Select "${profile.eeoc.raceEthnicity}" in the Race / Ethnicity dropdown`,
      `Select "${profile.eeoc.veteranStatus}" in the Veteran Status dropdown`,
      `Select "${profile.eeoc.disabilityStatus}" in the Disability Status dropdown`,
    );

    for (const instruction of instructions) {
      log("info", `AI action: ${instruction}`);
      try {
        await page.act(instruction);
        await captureFrame(page, frame);
      } catch (err) {
        log("warn", `AI could not complete: "${instruction}" (${(err as Error).message.split("\n")[0]})`);
      }
    }

    const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
    log("info", `Uploading resume via direct Playwright call: ${profile.resume.fileName}`);
    await page.getByLabel(/resume\/cv/i).setInputFiles(resumePath);
    await captureFrame(page, frame);

    log("info", "AI action: Click the Submit Application button");
    await page.act("Click the Submit Application button");

    await page.locator("#confirmation-panel").waitFor({ state: "visible", timeout: 8000 });
    await captureFrame(page, frame);

    log("info", "Extracting confirmation details with AI...");
    const { confirmationHeading, summaryText } = await page.extract({
      instruction: "Extract the confirmation heading text and the full applicant summary text shown after submitting the application",
      schema: z.object({
        confirmationHeading: z.string(),
        summaryText: z.string(),
      }),
    });

    return {
      success: true,
      message: "Application submitted successfully using the AI (Stagehand) strategy.",
      confirmationText: `${confirmationHeading}\n${summaryText}`,
    };
  } finally {
    await stagehand.close();
  }
}
