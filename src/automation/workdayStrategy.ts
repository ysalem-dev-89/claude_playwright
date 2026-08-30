import path from "node:path";
import type { Page } from "playwright";
import { ApplicantProfile } from "../types";
import { RunLogger } from "./logger";
import { StoredCredential, generatePassword } from "./credentialStore";
import { waitForWorkdayScreen } from "./workdaySteps";

export interface WorkdayAccountResult {
  email: string;
  password: string;
  isNewAccount: boolean;
}

/**
 * Tuned against this app's own mock Workday flow (public/mock-workday-job.html). A real
 * Workday tenant's exact ids/classes will differ from company to company — this is exactly
 * the gap workdayStagehandStrategy.ts (AI) is meant to close by reasoning about labels
 * instead of hardcoded selectors.
 */
export async function fillWorkdayAccountStep(
  page: Page,
  profile: ApplicantProfile,
  existingCredential: StoredCredential | undefined,
  log: RunLogger,
): Promise<WorkdayAccountResult> {
  const applyBtn = page.getByRole("button", { name: /^apply$/i });
  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
  }

  if (existingCredential) {
    log("info", `Found a saved account for this employer (${existingCredential.email}) — signing in instead of registering again.`);
    await page.locator("#tab-signin").click();
    await page.locator("#signin-email").fill(existingCredential.email);
    await page.locator("#signin-password").fill(existingCredential.password);
    await page.locator("#signin-btn").click();
    return { email: existingCredential.email, password: existingCredential.password, isNewAccount: false };
  }

  const password = generatePassword();
  log("info", `No saved account for this employer yet — creating one with ${profile.personal.email}.`);
  await page.locator("#tab-create").click().catch(() => {});
  await page.locator("#create-email").fill(profile.personal.email);
  await page.locator("#create-password").fill(password);
  await page.locator("#create-password-verify").fill(password);
  await page.locator("#create-terms").check();
  await page.locator("#create-account-btn").click();
  return { email: profile.personal.email, password, isNewAccount: true };
}

export async function fillWorkdayMyInformation(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  log("info", "Filling My Information...");
  await page.locator("#mi-first-name").fill(profile.personal.firstName);
  await page.locator("#mi-last-name").fill(profile.personal.lastName);
  if (profile.personal.address) {
    await page.locator("#mi-address1").fill(profile.personal.address.line1);
    await page.locator("#mi-city").fill(profile.personal.address.city);
    if (profile.personal.address.state) await page.locator("#mi-state").fill(profile.personal.address.state);
    if (profile.personal.address.postalCode) await page.locator("#mi-postal").fill(profile.personal.address.postalCode);
    await page.locator("#mi-country").selectOption({ label: profile.personal.address.country }, { timeout: 1200 }).catch(() =>
      log("warn", `No matching option for country "${profile.personal.address?.country}" — leaving blank.`),
    );
  }
  await page.locator("#mi-phone").fill(profile.personal.phone);
  if (profile.links.linkedin) await page.locator("#mi-linkedin").fill(profile.links.linkedin);
  if (profile.additionalInfo.howDidYouHear) {
    await page.locator("#mi-source").selectOption({ label: profile.additionalInfo.howDidYouHear }, { timeout: 1200 }).catch(() => {});
  }
  const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
  await page.locator("#mi-resume").setInputFiles(resumePath);
  await page.locator('button[data-next="my-experience"]').click();
}

export async function fillWorkdayMyExperience(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  log("info", "Filling My Experience...");

  const workHistory = profile.workHistory ?? [];
  for (let i = 0; i < workHistory.length; i++) {
    if (i > 0) await page.locator("#add-work-entry").click();
    const entry = page.locator(".work-entry").nth(i);
    const job = workHistory[i];
    await entry.getByLabel(/job title/i).fill(job.jobTitle);
    await entry.getByLabel(/^company/i).fill(job.company);
    if (job.location) await entry.getByLabel(/^location/i).fill(job.location);
    await entry.getByLabel(/start date/i).fill(job.startDate);
    if (job.isCurrent) {
      await entry.getByLabel(/i currently work here/i).check();
    } else if (job.endDate) {
      await entry.getByLabel(/end date/i).fill(job.endDate);
    }
    if (job.description) await entry.getByLabel(/role description/i).fill(job.description);
    log("info", `Added work experience: ${job.jobTitle} at ${job.company}`);
  }

  const education = profile.education ?? [];
  for (let i = 0; i < education.length; i++) {
    if (i > 0) await page.locator("#add-education-entry").click();
    const entry = page.locator(".education-entry").nth(i);
    const edu = education[i];
    await entry.getByLabel(/^school/i).fill(edu.school);
    if (edu.degree) await entry.getByLabel(/^degree/i).fill(edu.degree);
    if (edu.fieldOfStudy) await entry.getByLabel(/field of study/i).fill(edu.fieldOfStudy);
    if (edu.graduationDate) await entry.getByLabel(/graduation date/i).fill(edu.graduationDate);
    log("info", `Added education: ${edu.school}`);
  }

  await page.locator('button[data-next="application-questions"]').click();
}

export async function fillWorkdayApplicationQuestions(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  log("info", "Filling Application Questions...");
  await page.locator("#aq-work-auth").selectOption(profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No");
  await page.locator("#aq-sponsorship").selectOption(profile.workAuthorization.requiresSponsorship ? "Yes" : "No");
  if (profile.additionalInfo.desiredSalary) await page.locator("#aq-salary").fill(profile.additionalInfo.desiredSalary);
  if (profile.additionalInfo.availableStartDate) await page.locator("#aq-start-date").fill(profile.additionalInfo.availableStartDate);
  if (profile.coverLetter) await page.locator("#aq-cover-letter").fill(profile.coverLetter);
  await page.locator('button[data-next="voluntary-disclosures"]').click();
}

export async function fillWorkdayVoluntaryDisclosures(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  log("info", "Filling Voluntary Disclosures...");
  await page.locator("#vd-gender").selectOption({ label: profile.eeoc.gender }, { timeout: 1200 }).catch(() =>
    log("warn", `No matching option for gender "${profile.eeoc.gender}" — leaving blank.`),
  );
  await page.locator("#vd-ethnicity").selectOption({ label: profile.eeoc.raceEthnicity }, { timeout: 1200 }).catch(() =>
    log("warn", `No matching option for race/ethnicity "${profile.eeoc.raceEthnicity}" — leaving blank.`),
  );
  await page.locator("#vd-veteran").selectOption({ label: profile.eeoc.veteranStatus }, { timeout: 1200 }).catch(() =>
    log("warn", `No matching option for veteran status "${profile.eeoc.veteranStatus}" — leaving blank.`),
  );
  await page.locator('button[data-next="self-identify"]').click();
}

export async function fillWorkdaySelfIdentify(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  log("info", "Filling Self Identification...");
  await page.locator(`input[name="disability"][value="${profile.eeoc.disabilityStatus}"]`).check({ timeout: 1200 }).catch(async () => {
    log("warn", `No exact disability option matched "${profile.eeoc.disabilityStatus}" — selecting "I do not want to answer".`);
    await page.locator('input[name="disability"][value="I do not want to answer"]').check();
  });
  await page.locator("#si-name").fill(`${profile.personal.firstName} ${profile.personal.lastName}`);
  await page.locator('button[data-next="review"]').click();
}

/** Runs the full wizard with the heuristic (non-AI) strategy, stopping at the Review step. */
export async function runWorkdayHeuristicSteps(
  page: Page,
  profile: ApplicantProfile,
  existingCredential: StoredCredential | undefined,
  log: RunLogger,
): Promise<WorkdayAccountResult> {
  const account = await fillWorkdayAccountStep(page, profile, existingCredential, log);
  await waitForWorkdayScreen(page, "my-information", log);

  await fillWorkdayMyInformation(page, profile, log);
  await waitForWorkdayScreen(page, "my-experience", log);

  await fillWorkdayMyExperience(page, profile, log);
  await waitForWorkdayScreen(page, "application-questions", log);

  await fillWorkdayApplicationQuestions(page, profile, log);
  await waitForWorkdayScreen(page, "voluntary-disclosures", log);

  await fillWorkdayVoluntaryDisclosures(page, profile, log);
  await waitForWorkdayScreen(page, "self-identify", log);

  await fillWorkdaySelfIdentify(page, profile, log);
  await waitForWorkdayScreen(page, "review", log);

  log("success", "Reached the Review step — stopping before Submit.");
  return account;
}
