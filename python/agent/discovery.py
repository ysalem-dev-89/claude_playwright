"""AI parsing pass: reveal the application form if needed, then figure out — once — where
every field is and what kind of question it's asking. This is the only place in the whole
tool that costs an LLM call on a "warm" (cached) source; everything downstream reuses it.
"""

from __future__ import annotations

from typing import Callable

from .schema import DiscoveredForm, StandardFields
from .selectors import normalize_selector

Log = Callable[[str], None]

DISCOVERY_INSTRUCTION = (
    "Analyze this job application form in detail. For each of these standard fields, if it "
    "exists on the form, give its exact CSS selector and field type: first name, last name "
    "(or a single combined full-name field if that's how this form is built — set only "
    "whichever applies), email, phone, resume/CV upload, cover letter, LinkedIn profile URL, "
    "portfolio/personal website URL, and the final Submit button. If the form was hidden "
    "behind an 'Apply'/'Apply now' button that still needs clicking, also give that button's "
    "selector.\n\n"
    "Separately, find every OTHER question on the form that isn't one of the standard fields "
    "above — screening questions (work authorization, visa sponsorship, desired salary, "
    "start date, years of experience, how the candidate heard about the role), voluntary EEO "
    "questions (gender, race/ethnicity, veteran status, disability status), and any other "
    "employer-specific custom question. For each one, give its exact visible question text, "
    "a CSS selector (for a select/text field, the field itself; for a radio group, a selector "
    "for the group's container), its field type, the exact visible option text for any "
    "select/radio field, and your best classification of what it's really asking."
)

REVEAL_INSTRUCTION = (
    "If there is an 'Apply' or 'Apply now' button and the application form fields are not "
    "already visible, click it to reveal the form. If the form is already visible, do nothing."
)


async def reveal_form(page, standard: StandardFields, log: Log) -> None:
    """Make sure the actual field inputs are on the page before we try to discover or fill
    them. Tries the cached apply-button selector first (zero LLM cost); only asks the model to
    find and click it when there's no cached selector yet, or the cached one no longer works."""
    selector = normalize_selector(standard.apply_button_selector) if standard else None
    if selector:
        try:
            await page.locator(selector).click(timeout=2000)
            log("Clicked the Apply button (cached selector) to reveal the form.")
            await page.wait_for_timeout(400)
            return
        except Exception as err:  # noqa: BLE001
            log(f"Cached Apply button selector didn't work ({str(err).splitlines()[0]}) - asking AI instead...")
    try:
        await page.act(REVEAL_INSTRUCTION)
        await page.wait_for_timeout(400)
    except Exception as err:  # noqa: BLE001 - best-effort, the form may already be visible
        log(f"No separate Apply button needed (or none found): {err}")


def _normalize_form_selectors(form: DiscoveredForm) -> DiscoveredForm:
    s = form.standard
    s.apply_button_selector = normalize_selector(s.apply_button_selector)
    s.submit_button_selector = normalize_selector(s.submit_button_selector)
    for field in (
        s.first_name, s.last_name, s.full_name, s.email, s.phone,
        s.resume_upload, s.cover_letter, s.linkedin, s.portfolio_website,
    ):
        if field is not None:
            field.selector = normalize_selector(field.selector)
    for question in form.screening_questions:
        question.selector = normalize_selector(question.selector) or question.selector
    return form


async def discover_form(page, log: Log) -> DiscoveredForm:
    """Assumes the form is already visible (call reveal_form first)."""
    log("Asking the model to map every field on this form (one LLM call)...")
    form = await page.extract(DISCOVERY_INSTRUCTION, schema=DiscoveredForm)
    form = _normalize_form_selectors(form)
    log(
        f"Parsed {sum(1 for v in form.standard.model_dump().values() if v)} standard field(s) "
        f"and {len(form.screening_questions)} screening question(s)."
    )
    return form
