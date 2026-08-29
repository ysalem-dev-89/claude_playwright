import path from "node:path";
import type { Page } from "@browserbasehq/stagehand";
import { ApplicantProfile } from "../types";
import { RunLogger } from "./logger";

/**
 * AI-powered strategy: describes each field in plain English and lets Stagehand's act()
 * figure out which element to interact with, instead of hardcoding selectors. The resume
 * file upload still goes through the underlying Playwright Page directly (Stagehand's page
 * *is* a real Playwright Page under the hood) since native file choosers aren't something
 * act() drives reliably.
 *
 * Operates on an already-open page (part of a live, user-controllable session) — it only
 * fills fields, it never navigates, submits, or manages the browser's lifecycle.
 */
export async function fillAiFields(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
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
    } catch (err) {
      log("warn", `AI could not complete: "${instruction}" (${(err as Error).message.split("\n")[0]})`);
    }
  }

  const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
  log("info", `Uploading resume via direct Playwright call: ${profile.resume.fileName}`);
  await page.getByLabel(/resume\/cv/i).setInputFiles(resumePath);
}
