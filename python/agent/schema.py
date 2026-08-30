"""Pydantic models shared by discovery (AI parsing), the cache, and the DOM filler."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

FieldType = Literal["text", "email", "tel", "url", "textarea", "file", "select", "radio", "checkbox"]

QuestionIntent = Literal[
    "work_authorization",
    "sponsorship",
    "desired_salary",
    "start_date",
    "how_heard",
    "years_experience",
    "gender",
    "race_ethnicity",
    "veteran_status",
    "disability_status",
    "other",
]


class DiscoveredField(BaseModel):
    """One standard field the AI located on the page. `selector` is null when the field
    genuinely doesn't exist on this particular form (e.g. no portfolio field configured)."""

    selector: Optional[str] = Field(None, description="CSS selector that uniquely identifies this field")
    field_type: FieldType = "text"
    option_labels: Optional[list[str]] = Field(None, description="For select fields: every visible option's exact text")


class ScreeningQuestion(BaseModel):
    """One employer-specific screening/custom/EEO question, discovered fresh per job posting
    (these vary per employer even on the same ATS, unlike the standard fields)."""

    question_text: str
    selector: str = Field(description="CSS selector for the input/select, or the radio group's container")
    field_type: FieldType
    option_labels: Optional[list[str]] = None
    intent: QuestionIntent = Field(description="Best-guess classification of what this question is really asking")


class StandardFields(BaseModel):
    """Fields common to virtually every application on this ATS/hostname — safe to cache and
    reuse across different job postings on the same platform."""

    apply_button_selector: Optional[str] = Field(None, description="The 'Apply'/'Apply now' button, if the form starts hidden")
    first_name: Optional[DiscoveredField] = None
    last_name: Optional[DiscoveredField] = None
    full_name: Optional[DiscoveredField] = Field(None, description="Only set if the form uses one combined name field instead of first/last")
    email: Optional[DiscoveredField] = None
    phone: Optional[DiscoveredField] = None
    resume_upload: Optional[DiscoveredField] = None
    cover_letter: Optional[DiscoveredField] = None
    linkedin: Optional[DiscoveredField] = None
    portfolio_website: Optional[DiscoveredField] = None
    submit_button_selector: Optional[str] = None


class DiscoveredForm(BaseModel):
    """The full output of one AI parse pass — everything needed to fill this form by DOM alone
    from now on, split into what's safe to reuse platform-wide vs. what's specific to this job."""

    standard: StandardFields
    screening_questions: list[ScreeningQuestion] = Field(default_factory=list)


# --- Applicant profile -------------------------------------------------------------------

class Address(BaseModel):
    line1: str
    city: str
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: str


class Personal(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    location: Optional[str] = None
    address: Optional[Address] = None


class Links(BaseModel):
    linkedin: Optional[str] = None
    portfolio: Optional[str] = None
    github: Optional[str] = None


class Resume(BaseModel):
    file_name: str
    file_path: str = Field(description="Path on disk, relative to the python/ directory, to the file that will be uploaded")


class WorkAuthorization(BaseModel):
    authorized_to_work: bool
    requires_sponsorship: bool


class AdditionalInfo(BaseModel):
    how_did_you_hear: Optional[str] = None
    desired_salary: Optional[str] = None
    available_start_date: Optional[str] = None
    years_experience: Optional[str] = None


class Eeoc(BaseModel):
    gender: Optional[str] = None
    race_ethnicity: Optional[str] = None
    veteran_status: Optional[str] = None
    disability_status: Optional[str] = None


class ApplicantProfile(BaseModel):
    personal: Personal
    links: Links = Field(default_factory=Links)
    resume: Resume
    work_authorization: WorkAuthorization
    cover_letter: Optional[str] = None
    additional_info: AdditionalInfo = Field(default_factory=AdditionalInfo)
    eeoc: Eeoc = Field(default_factory=Eeoc)
