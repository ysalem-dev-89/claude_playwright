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
export type Platform = "greenhouse" | "workday";

export interface CreateSessionRequest {
  strategy: FillStrategy;
  platform: Platform;
  /** Omit (or leave blank) to use the platform's built-in mock job posting. */
  jobUrl?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  /** True when jobUrl pointed somewhere other than this app's own mock posting — submission is disabled for these. */
  isExternal: boolean;
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
