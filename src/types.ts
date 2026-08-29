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
