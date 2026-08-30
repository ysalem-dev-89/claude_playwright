"""Fills a form purely by DOM (Playwright locators, zero LLM calls) using a discovered/cached
field map. The only LLM usage in this module is a last-resort, single-field `act()` repair
when a cached selector no longer matches anything on the page.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Callable, Optional

from .schema import ApplicantProfile, DiscoveredField, ScreeningQuestion, StandardFields

Log = Callable[[str], None]

DEFAULT_PACE_SECONDS = 0.45
AFFIRMATIVE = {"yes", "true", "1"}


@dataclass
class FillReport:
    filled: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    unanswered_questions: list[str] = field(default_factory=list)
    repaired_by_ai: list[str] = field(default_factory=list)


def _closest_option(value: str, options: Optional[list[str]]) -> Optional[str]:
    """Real forms rarely spell an option exactly like our profile does (e.g. our "Decline to
    self identify" vs. this site's "Prefer not to say") — try exact, then substring, then a
    small set of common opt-out synonyms, before giving up."""
    if not options:
        return value
    value_lower = value.strip().lower()
    for opt in options:
        if opt.strip().lower() == value_lower:
            return opt
    for opt in options:
        if value_lower in opt.lower() or opt.lower() in value_lower:
            return opt
    opt_out_words = ("decline", "prefer not", "wish", "do not want", "don't want", "no answer", "not to say")
    if any(w in value_lower for w in opt_out_words):
        for opt in options:
            if any(w in opt.lower() for w in opt_out_words):
                return opt
    return None


async def _ai_repair(page, label: str, value: str, field_type: str, log: Log) -> bool:
    verb = {
        "file": f'Upload the file at path "{value}" to',
        "select": f'Select "{value}" in',
        "radio": f'Select "{value}" for',
        "checkbox": ("Check" if value.lower() in AFFIRMATIVE else "Uncheck"),
    }.get(field_type, f'Type "{value}" into')
    instruction = f'{verb} the "{label}" field' if field_type != "checkbox" else f'{verb} the "{label}" checkbox'
    try:
        await page.act(instruction)
        log(f'  AI repair succeeded for "{label}"')
        return True
    except Exception as err:  # noqa: BLE001
        log(f'  AI repair also failed for "{label}": {str(err).splitlines()[0]}')
        return False


async def _fill_one(page, selector: str, field_type: str, value: str, label: str, log: Log, report: FillReport) -> None:
    try:
        locator = page.locator(selector)
        if field_type == "file":
            await locator.set_input_files(value)
        elif field_type == "select":
            await locator.select_option(label=value, timeout=1500)
        elif field_type == "radio":
            await locator.get_by_text(value, exact=False).first.click(timeout=1500)
        elif field_type == "checkbox":
            if value.lower() in AFFIRMATIVE:
                await locator.check(timeout=1500)
            else:
                await locator.uncheck(timeout=1500)
        else:
            await locator.fill(value, timeout=1500)
        log(f'Filled "{label}" -> "{value}"')
        report.filled.append(label)
    except Exception as err:  # noqa: BLE001
        log(f'Could not fill "{label}" via DOM ({str(err).splitlines()[0]}) - trying a live AI repair...')
        if await _ai_repair(page, label, value, field_type, log):
            report.filled.append(label)
            report.repaired_by_ai.append(label)
        else:
            report.skipped.append(label)


def _standard_value(field_key: str, profile: ApplicantProfile, resume_path: str) -> Optional[str]:
    p = profile
    return {
        "first_name": p.personal.first_name,
        "last_name": p.personal.last_name,
        "full_name": f"{p.personal.first_name} {p.personal.last_name}",
        "email": p.personal.email,
        "phone": p.personal.phone,
        "resume_upload": resume_path,
        "cover_letter": p.cover_letter,
        "linkedin": p.links.linkedin,
        "portfolio_website": p.links.portfolio,
    }.get(field_key)


def _intent_value(intent: str, profile: ApplicantProfile) -> Optional[str]:
    wa, ai, eeoc = profile.work_authorization, profile.additional_info, profile.eeoc
    return {
        "work_authorization": "Yes" if wa.authorized_to_work else "No",
        "sponsorship": "Yes" if wa.requires_sponsorship else "No",
        "desired_salary": ai.desired_salary,
        "start_date": ai.available_start_date,
        "how_heard": ai.how_did_you_hear,
        "years_experience": ai.years_experience,
        "gender": eeoc.gender,
        "race_ethnicity": eeoc.race_ethnicity,
        "veteran_status": eeoc.veteran_status,
        "disability_status": eeoc.disability_status,
    }.get(intent)


async def fill_application(
    page,
    standard: StandardFields,
    questions: list[ScreeningQuestion],
    profile: ApplicantProfile,
    resume_path: str,
    log: Log,
    pace_seconds: float = DEFAULT_PACE_SECONDS,
) -> FillReport:
    report = FillReport()

    standard_dict: dict[str, Optional[DiscoveredField]] = {
        "first_name": standard.first_name,
        "last_name": standard.last_name,
        "full_name": standard.full_name,
        "email": standard.email,
        "phone": standard.phone,
        "resume_upload": standard.resume_upload,
        "cover_letter": standard.cover_letter,
        "linkedin": standard.linkedin,
        "portfolio_website": standard.portfolio_website,
    }

    for key, discovered in standard_dict.items():
        if not discovered or not discovered.selector:
            continue
        value = _standard_value(key, profile, resume_path)
        if not value:
            continue
        await _fill_one(page, discovered.selector, discovered.field_type, value, key.replace("_", " "), log, report)
        await asyncio.sleep(pace_seconds)

    for question in questions:
        if question.intent == "other":
            report.unanswered_questions.append(question.question_text)
            log(f'Skipping "{question.question_text}" - no matching profile field (intent: other). Review manually.')
            continue

        raw_value = _intent_value(question.intent, profile)
        if not raw_value:
            report.unanswered_questions.append(question.question_text)
            log(f'Skipping "{question.question_text}" - profile has no value for "{question.intent}".')
            continue

        value = raw_value
        if question.field_type in ("select", "radio"):
            matched = _closest_option(raw_value, question.option_labels)
            if not matched:
                report.unanswered_questions.append(question.question_text)
                log(f'Skipping "{question.question_text}" - no option resembling "{raw_value}" among {question.option_labels}.')
                continue
            value = matched

        await _fill_one(page, question.selector, question.field_type, value, question.question_text, log, report)
        await asyncio.sleep(pace_seconds)

    return report
