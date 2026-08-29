import { ApplicantProfile } from "./types";

/**
 * Placeholder applicant used until the real user info object is provided.
 * Shape mirrors what a Greenhouse job application form typically asks for.
 */
export const sampleProfile: ApplicantProfile = {
  personal: {
    firstName: "Jordan",
    lastName: "Rivera",
    email: "jordan.rivera@example.com",
    phone: "+1-555-013-4892",
    location: "San Francisco, CA",
  },
  links: {
    linkedin: "https://linkedin.com/in/jordan-rivera-dev",
    portfolio: "https://jordanrivera.dev",
    github: "https://github.com/jordanrivera",
  },
  resume: {
    fileName: "Jordan_Rivera_Resume.txt",
    filePath: "sample-data/resume.txt",
  },
  workAuthorization: {
    authorizedToWorkInUS: true,
    requiresSponsorship: false,
  },
  coverLetter:
    "I'm excited to apply for this role — I've spent the last several years building " +
    "developer tools and I'd love to bring that experience to your team. My background in " +
    "distributed systems and my track record shipping products end-to-end make me a strong fit.",
  additionalInfo: {
    howDidYouHear: "Company Website",
    desiredSalary: "$150,000",
    availableStartDate: "2026-09-29",
  },
  eeoc: {
    gender: "Decline To Self Identify",
    raceEthnicity: "Decline To Self Identify",
    veteranStatus: "I don't wish to answer",
    disabilityStatus: "I don't wish to answer",
  },
};
