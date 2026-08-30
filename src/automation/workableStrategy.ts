import path from "node:path";
import type { Page } from "playwright";
import { ApplicantProfile } from "../types";
import { RunLogger } from "./logger";

// Deliberately slower than Greenhouse's pacing — the point here is to watch the fill happen,
// not just prove the frames technically stream.
const STEP_PAUSE_MS = 450;

interface SelectField {
  kind: "select";
  id: string;
  label: string;
  value: string | undefined;
}
interface TextField {
  kind: "text";
  id: string;
  label: string;
  value: string | undefined;
}
type Field = SelectField | TextField;

/**
 * Deterministic, non-AI baseline tuned against this app's own mock Workable flow
 * (public/mock-workable-job.html). A real Workable posting's exact field ids/wording will
 * differ by employer — that gap is what workableStagehandStrategy.ts (AI) is meant to close.
 */
export async function fillWorkableApplication(page: Page, profile: ApplicantProfile, log: RunLogger): Promise<void> {
  const applyBtn = page.getByRole("button", { name: /^apply now$/i });
  if (await applyBtn.isVisible().catch(() => false)) {
    log("info", "Clicking Apply now...");
    await applyBtn.click();
    await page.waitForTimeout(STEP_PAUSE_MS);
  }

  const fields: Field[] = [
    { kind: "text", id: "#full-name", label: "Full name", value: `${profile.personal.firstName} ${profile.personal.lastName}` },
    { kind: "text", id: "#email", label: "Email", value: profile.personal.email },
    { kind: "text", id: "#phone", label: "Phone", value: profile.personal.phone },
    { kind: "text", id: "#cover-letter", label: "Cover letter", value: profile.coverLetter },
    { kind: "text", id: "#linkedin", label: "LinkedIn", value: profile.links.linkedin },
    { kind: "text", id: "#portfolio", label: "Portfolio", value: profile.links.portfolio },
    {
      kind: "select",
      id: "#work-auth",
      label: "work authorization",
      value: profile.workAuthorization.authorizedToWorkInUS ? "Yes" : "No",
    },
    {
      kind: "select",
      id: "#sponsorship",
      label: "sponsorship",
      value: profile.workAuthorization.requiresSponsorship ? "Yes" : "No",
    },
    { kind: "text", id: "#desired-salary", label: "desired salary", value: profile.additionalInfo.desiredSalary },
    { kind: "select", id: "#referral-source", label: "referral source", value: profile.additionalInfo.howDidYouHear },
    { kind: "select", id: "#gender", label: "gender", value: profile.eeoc.gender },
    { kind: "select", id: "#race-ethnicity", label: "race/ethnicity", value: profile.eeoc.raceEthnicity },
    { kind: "select", id: "#veteran-status", label: "veteran status", value: profile.eeoc.veteranStatus },
    { kind: "select", id: "#disability-status", label: "disability status", value: profile.eeoc.disabilityStatus },
  ];

  for (const field of fields) {
    if (!field.value) continue;
    try {
      if (field.kind === "text") {
        await page.locator(field.id).fill(field.value);
        log("info", `Filled "${field.label}" → "${field.value}"`);
      } else {
        await page.locator(field.id).selectOption({ label: field.value }, { timeout: 1200 });
        log("info", `Selected "${field.value}" for "${field.label}"`);
      }
    } catch (err) {
      log("warn", `Could not fill "${field.label}" — skipping (${(err as Error).message.split("\n")[0]})`);
    }
    await page.waitForTimeout(STEP_PAUSE_MS);
  }

  const resumePath = path.resolve(process.cwd(), profile.resume.filePath);
  log("info", `Uploading resume: ${profile.resume.fileName}`);
  await page.locator("#resume").setInputFiles(resumePath);
  await page.waitForTimeout(STEP_PAUSE_MS);
}
