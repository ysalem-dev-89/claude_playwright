export interface ApplicantProfile {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
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
}

export type FillStrategy = "heuristic" | "ai";

export interface CreateSessionRequest {
  strategy: FillStrategy;
  /** Omit (or leave blank) to use the built-in mock job posting. */
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
