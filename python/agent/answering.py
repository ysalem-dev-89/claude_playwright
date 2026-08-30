"""Second AI pass, separate from form discovery: for a screening question the applicant
profile has no direct field for (an open-ended "tell us about..." question, a yes/no the
profile doesn't model, a custom employer question), ask the model for a short, honest answer
grounded in the candidate's actual profile and resume — instead of leaving the field blank.

This is a plain text completion via litellm directly (not a Stagehand page.act()/extract()
call), since it doesn't need to look at the DOM at all: the question text was already captured
during form discovery, and the answer just needs to be written, not located.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

import litellm

from .schema import ApplicantProfile, ScreeningQuestion

Log = Callable[[str], None]

MAX_RESUME_CHARS = 6000


def extract_resume_text(resume_path: str) -> str:
    """Best-effort plain text for the AI-answering prompt. Falls back to just the filename
    when the format can't be read here (e.g. a PDF) — the answer step still has the applicant
    profile JSON to work from even without resume text."""
    path = Path(resume_path)
    suffix = path.suffix.lower()
    try:
        if suffix == ".txt":
            return path.read_text(errors="ignore")[:MAX_RESUME_CHARS]
        if suffix == ".docx":
            import docx  # local import: only needed for this one path

            document = docx.Document(str(path))
            text = "\n".join(p.text for p in document.paragraphs if p.text)
            return text[:MAX_RESUME_CHARS]
    except Exception:
        pass
    return f"(Resume file: {path.name} — full text not extracted for this file type.)"


def _build_prompt(profile: ApplicantProfile, resume_text: str, question: ScreeningQuestion) -> str:
    options_note = ""
    if question.option_labels:
        options_note = (
            f'\n\nThis field is a {question.field_type} — reply with EXACTLY one of these options, '
            f"verbatim, character for character: {question.option_labels}"
        )
    return (
        "You are helping a real candidate fill out a real job application form, truthfully, on "
        "their own behalf. Here is their profile:\n\n"
        f"{profile.model_dump_json(indent=2)}\n\n"
        f"Resume text:\n{resume_text}\n\n"
        f'The application form asks this question: "{question.question_text}"\n'
        f"Field type: {question.field_type}.{options_note}\n\n"
        "Reply with ONLY the exact text/value to put in this field — no explanation, no quotes, "
        "no preamble, no markdown. Answer honestly and consistently with the profile above: if "
        "the profile doesn't show a qualification the question asks about (e.g. a security "
        "clearance, a certification, a degree), answer the way a real candidate without it "
        "would (e.g. \"No\" / \"None\" / \"Not applicable\") — never invent a credential the "
        "candidate doesn't have. For an open-ended question with no factual answer in the "
        "profile (e.g. \"why do you want this role\"), write a brief, genuine-sounding "
        "sentence or two consistent with the profile's experience — do not leave it generic "
        "filler."
    )


async def generate_answer(
    model: str,
    api_key: str,
    profile: ApplicantProfile,
    resume_text: str,
    question: ScreeningQuestion,
    log: Log,
) -> Optional[str]:
    prompt = _build_prompt(profile, resume_text, question)
    try:
        response = await litellm.acompletion(
            model=model,
            api_key=api_key,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        text = (response["choices"][0]["message"]["content"] or "").strip().strip('"')
        if not text:
            return None
        log(f'AI answered "{question.question_text}" -> "{text}"')
        return text
    except Exception as err:  # noqa: BLE001
        log(f'AI answer-generation failed for "{question.question_text}": {err}')
        return None
