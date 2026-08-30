export interface ApplicantProfile {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    /** Structured address, used by the Workday flow's "My Information" step. Not needed for Greenhouse. */
    address?: {
      line1: string;
      city: string;
      state?: string;
      postalCode?: string;
      country: string;
    };
  };
  links: {
    linkedin?: string;
    portfolio?: string;
    github?: string;
  };
  resume: {
    fileName: string;
    /** Path on disk, relative to the project root, to the file that will be uploaded. */
    filePath: string;
  };
  workAuthorization: {
    authorizedToWorkInUS: boolean;
    requiresSponsorship: boolean;
  };
  coverLetter?: string;
  additionalInfo: {
    howDidYouHear: string;
    desiredSalary?: string;
    availableStartDate?: string;
  };
  eeoc: {
    gender: string;
    raceEthnicity: string;
    veteranStatus: string;
    disabilityStatus: string;
  };
  /** Used by the Workday flow's "My Experience" step. Not needed for Greenhouse. */
  workHistory?: WorkHistoryEntry[];
  /** Used by the Workday flow's "My Experience" step. Not needed for Greenhouse. */
  education?: EducationEntry[];
}

export interface WorkHistoryEntry {
  jobTitle: string;
  company: string;
  location?: string;
  /** Free-form, e.g. "June 2021" — matches Workday's own loosely-formatted date fields. */
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

export interface EducationEntry {
  school: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationDate?: string;
}

export type FillStrategy = "heuristic" | "ai";
export type Platform = "greenhouse" | "workday" | "workable";

/**
 * Platforms where an external (real, non-mock) target is still allowed to actually submit.
 * Greenhouse and Workday stay fill-only on real postings — Workable is the one platform this
 * app is meant to be used for real, so its sessions skip the "block every non-GET request"
 * guarantee the other two get. Nothing about this changes the "never auto-submit by default"
 * rule: the fill/submit split and the autoSubmit toggle work the same on every platform.
 */
export const PLATFORMS_ALLOWING_REAL_SUBMISSION: ReadonlySet<Platform> = new Set(["workable"]);

export interface CreateSessionRequest {
  strategy: FillStrategy;
  platform: Platform;
  /** Omit (or leave blank) to use the platform's built-in mock job posting. */
  jobUrl?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  /** True when jobUrl pointed somewhere other than this app's own mock posting. */
  isExternal: boolean;
  /** True when this session is allowed to actually submit even though isExternal is true. */
  realSubmissionAllowed: boolean;
}

export interface FillRequest {
  profile: ApplicantProfile;
  autoSubmit: boolean;
}

export type RunEvent =
  | { type: "log"; level: "info" | "success" | "warn" | "error"; message: string; timestamp: number }
  | {
      type: "done";
      success: boolean;
      message: string;
      confirmationText?: string;
      awaitingManualSubmit?: boolean;
    };
