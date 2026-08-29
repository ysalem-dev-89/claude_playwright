import path from "node:path";
import type { Page } from "@browserbasehq/stagehand";
import { ApplicantProfile } from "../types";
import { RunLogger } from "./logger";
import { StoredCredential } from "./credentialStore";
import { fillWorkdayAccountStep, WorkdayAccountResult } from "./workdayStrategy";
import { waitForWorkdayScreen } from "./workdaySteps";

async function act(page: Page, instruction: string, log: RunLogger): Promise<void> {
  log("info", `AI action: ${instruction}`);
  try {
    await page.act(instruction);
  } catch (err) {
    log("warn", `AI could not complete: "${instruction}" (${(err as Error).message.split("\n")[0]})`);
  }
}

export async function fillWorkdayMyInformationAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  await act(page, `Type "${profile.personal.firstName}" into the Legal First Name field`, log);
  await act(page, `Type "${profile.personal.lastName}" into the Legal Last Name field`, log);
  if (profile.personal.address) {
    await act(page, `Type "${profile.personal.address.line1}" into the Address Line 1 field`, log);
    await act(page, `Type "${profile.personal.address.city}" into the City field`, log);
    if (profile.personal.address.state) await act(page, `Type "${profile.personal.address.state}" into the State/Province field`, log);
    if (profile.personal.address.postalCode) await act(page, `Type "${profile.personal.address.postalCode}" into the Postal Code field`, log);
    await act(page, `Select "${profile.personal.address.country}" in the Country dropdown`, log);
  }
  await act(page, `Type "${profile.personal.phone}" into the Phone Number field`, log);
  if (profile.links.linkedin) await act(page, `Type "${profile.links.linkedin}" into the Social Network URL / LinkedIn field`, log);
  if (profile.additionalInfo.howDidYouHear) await act(page, `Select "${profile.additionalInfo.howDidYouHear}" in the "How did you hear about us?" dropdown`, log);

  const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
  log("info", `Uploading resume via direct Playwright call: ${profile.resume.fileName}`);
  await page.getByLabel(/resume\/cv/i).setInputFiles(resumePath);

  await act(page, `Click the Save and Continue button`, log);
}

export async function fillWorkdayMyExperienceAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  const workHistory = profile.workHistory ?? [];
  for (let i = 0; i < workHistory.length; i++) {
    if (i > 0) {
      log("info", "Adding another work experience entry via direct Playwright call");
      await page.getByRole("button", { name: /add another work experience/i }).click();
    }
    const job = workHistory[i];
    const ordinal = i === 0 ? "first" : i === 1 ? "second" : i === 2 ? "third" : `${i + 1}th`;
    await act(page, `Type "${job.jobTitle}" into the Job Title field of the ${ordinal} work experience entry`, log);
    await act(page, `Type "${job.company}" into the Company field of the ${ordinal} work experience entry`, log);
    if (job.location) await act(page, `Type "${job.location}" into the Location field of the ${ordinal} work experience entry`, log);
    await act(page, `Type "${job.startDate}" into the Start Date field of the ${ordinal} work experience entry`, log);
    if (job.isCurrent) {
      await act(page, `Check the "I currently work here" checkbox on the ${ordinal} work experience entry`, log);
    } else if (job.endDate) {
      await act(page, `Type "${job.endDate}" into the End Date field of the ${ordinal} work experience entry`, log);
    }
    if (job.description) await act(page, `Type the following into the Role Description field of the ${ordinal} work experience entry: "${job.description}"`, log);
  }

  const education = profile.education ?? [];
  for (let i = 0; i < education.length; i++) {
    if (i > 0) {
      log("info", "Adding another education entry via direct Playwright call");
      await page.getByRole("button", { name: /add another education/i }).click();
    }
    const edu = education[i];
    const ordinal = i === 0 ? "first" : i === 1 ? "second" : `${i + 1}th`;
    await act(page, `Type "${edu.school}" into the School field of the ${ordinal} education entry`, log);
    if (edu.degree) await act(page, `Type "${edu.degree}" into the Degree field of the ${ordinal} education entry`, log);
    if (edu.fieldOfStudy) await act(page, `Type "${edu.fieldOfStudy}" into the Field of Study field of the ${ordinal} education entry`, log);
    if (edu.graduationDate) await act(page, `Type "${edu.graduationDate}" into the Graduation Date field of the ${ordinal} education entry`, log);
  }

  await act(page, `Click the Save and Continue button`, log);
}

export async function fillWorkdayApplicationQuestionsAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  await act(page, `Select "${profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No"}" in the dropdown asking if the applicant is legally eligible to work in the country`, log);
  await act(page, `Select "${profile.workAuthorization.requiresSponsorship ? "Yes" : "No"}" in the dropdown asking about visa sponsorship`, log);
  if (profile.additionalInfo.desiredSalary) await act(page, `Type "${profile.additionalInfo.desiredSalary}" into the Desired Salary field`, log);
  if (profile.additionalInfo.availableStartDate) await act(page, `Type "${profile.additionalInfo.availableStartDate}" into the Earliest Start Date field`, log);
  if (profile.coverLetter) await act(page, `Type the following into the additional comments field: "${profile.coverLetter}"`, log);
  await act(page, `Click the Save and Continue button`, log);
}

export async function fillWorkdayVoluntaryDisclosuresAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  await act(page, `Select "${profile.eeoc.gender}" in the Gender dropdown`, log);
  await act(page, `Select "${profile.eeoc.raceEthnicity}" in the Race/Ethnicity dropdown`, log);
  await act(page, `Select "${profile.eeoc.veteranStatus}" in the Veteran Status dropdown`, log);
  await act(page, `Click the Save and Continue button`, log);
}

export async function fillWorkdaySelfIdentifyAi(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  await act(page, `Select the disability self-identification option: "${profile.eeoc.disabilityStatus}"`, log);
  await act(page, `Type "${profile.personal.firstName} ${profile.personal.lastName}" into the electronic signature / name field`, log);
  await act(page, `Click the Save and Continue button`, log);
}

/** Runs the full wizard with the AI (Stagehand) strategy, stopping at the Review step. */
export async function runWorkdayAiSteps(
  page: Page,
  profile: ApplicantProfile,
  existingCredential: StoredCredential | undefined,
  log: RunLogger,
): Promise<WorkdayAccountResult> {
  const account = await fillWorkdayAccountStep(page, profile, existingCredential, log);
  await waitForWorkdayScreen(page, "my-information", log);

  await fillWorkdayMyInformationAi(page, profile, log);
  await waitForWorkdayScreen(page, "my-experience", log);

  await fillWorkdayMyExperienceAi(page, profile, log);
  await waitForWorkdayScreen(page, "application-questions", log);

  await fillWorkdayApplicationQuestionsAi(page, profile, log);
  await waitForWorkdayScreen(page, "voluntary-disclosures", log);

  await fillWorkdayVoluntaryDisclosuresAi(page, profile, log);
  await waitForWorkdayScreen(page, "self-identify", log);

  await fillWorkdaySelfIdentifyAi(page, profile, log);
  await waitForWorkdayScreen(page, "review", log);

  log("success", "Reached the Review step — stopping before Submit.");
  return account;
}
