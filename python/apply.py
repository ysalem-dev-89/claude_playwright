#!/usr/bin/env python3
"""Fill out (and optionally submit) a real job application.

AI-first, DOM-cached: the first time this script sees a job source, it uses Stagehand (an LLM)
to figure out where every field is and what each question is asking, then saves that map to
disk. Every run after that fills the form by plain Playwright DOM calls — no LLM involved —
until something breaks, at which point just that one field falls back to a live AI call.

Usage:
    python apply.py <job_url> [--debug] [--profile path.json] [--submit]

See README.md in this directory for the full flag list and how the cache works.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from stagehand import Stagehand, StagehandConfig

from agent.answering import extract_resume_text
from agent.cache import (
    DEFAULT_CACHE_DIR,
    job_key,
    load_job_questions,
    load_platform_fields,
    platform_key,
    save_job_questions,
    save_platform_fields,
)
from agent.discovery import discover_form, reveal_form
from agent.filler import fill_application
from agent.schema import ApplicantProfile, DiscoveredForm, StandardFields
from agent.selectors import normalize_selector

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PROFILE_PATH = SCRIPT_DIR / "profile.example.json"

# Stagehand resolves models through litellm, so any "<provider>/<model>" string litellm supports
# works here — this just maps the provider prefix to the env var litellm reads for it, so we can
# fail with a clear, provider-specific message instead of "ANTHROPIC_API_KEY is not set" no
# matter which provider you actually picked.
PROVIDER_ENV_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "novita": "NOVITA_API_KEY",
    "google": "GOOGLE_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "groq": "GROQ_API_KEY",
    "azure": "AZURE_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "together_ai": "TOGETHERAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "xai": "XAI_API_KEY",
}


def resolve_provider(model_name: str) -> str:
    """Everything before the first "/" is the provider, e.g. "novita/deepseek/deepseek-v3" ->
    "novita". A bare model name with no prefix is assumed to be Anthropic or OpenAI based on its
    naming convention, matching how litellm itself infers it."""
    if "/" in model_name:
        return model_name.split("/", 1)[0].lower()
    lowered = model_name.lower()
    if lowered.startswith(("gpt-", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if lowered.startswith("gemini"):
        return "google"
    return "anthropic"


def log(message: str) -> None:
    print(f"[apply] {message}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fill out (and optionally submit) a real job application, AI-first with a DOM-replay cache.",
    )
    parser.add_argument("url", help="The job posting URL (e.g. a jobs.workable.com/view/... link)")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Open a real, visible browser window instead of headless, and pause before closing so you can watch/review.",
    )
    parser.add_argument(
        "--profile",
        default=str(DEFAULT_PROFILE_PATH),
        help="Path to your applicant profile JSON (default: the bundled placeholder — replace it with your own before using --submit for real).",
    )
    parser.add_argument(
        "--strategy",
        choices=["auto", "ai"],
        default="auto",
        help="'auto' (default): reuse the cached field map if one exists for this source, else discover it via AI and save it. "
        "'ai': always re-discover via a fresh AI pass this run (still saves the result for next time).",
    )
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Actually click Submit after filling. Without this flag the script only fills the form and leaves it for you to review.",
    )
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt before a real --submit.")
    parser.add_argument(
        "--model",
        default=os.environ.get("STAGEHAND_MODEL", "anthropic/claude-3-7-sonnet-latest"),
        help="Model to use for parsing/repair, as '<provider>/<model>' (e.g. 'openai/gpt-4o', "
        "'anthropic/claude-3-7-sonnet-latest', 'novita/deepseek/deepseek-v3'). Default: "
        "anthropic/claude-3-7-sonnet-latest, or $STAGEHAND_MODEL. The matching provider's API "
        "key env var must be set (see --help output for python/README.md's provider table).",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Override the model API key directly instead of reading it from the provider's "
        "usual env var (e.g. for a provider not in the built-in list, or a differently-named key).",
    )
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR), help="Where learned field maps are stored.")
    return parser.parse_args()


def load_profile(path: str) -> ApplicantProfile:
    raw = json.loads(Path(path).read_text())
    profile = ApplicantProfile.model_validate(raw)
    if Path(path).resolve() == DEFAULT_PROFILE_PATH.resolve():
        log("Using the bundled placeholder profile (Jordan Rivera). Pass --profile your.json with your own data before using --submit for real.")
    return profile


def resolve_resume_path(profile: ApplicantProfile) -> str:
    resume_path = Path(profile.resume.file_path)
    if not resume_path.is_absolute():
        resume_path = (SCRIPT_DIR / resume_path).resolve()
    if not resume_path.exists():
        raise FileNotFoundError(f"Resume file not found: {resume_path}")
    return str(resume_path)


async def get_or_discover_form(page, url: str, cache_dir: Path, strategy: str) -> DiscoveredForm:
    hostname = platform_key(url)
    job = job_key(url)

    if strategy == "auto":
        cached_standard = load_platform_fields(cache_dir, hostname)
        cached_questions = load_job_questions(cache_dir, hostname, job)
        if cached_standard is not None and cached_questions is not None:
            log(f"Using cached field map for {hostname} (job {job}) — no LLM call needed to locate fields.")
            await reveal_form(page, cached_standard, log)
            return DiscoveredForm(standard=cached_standard, screening_questions=cached_questions)
        log(f"No cached field map yet for {hostname} (job {job}) — parsing this form with AI once.")
    else:
        log("Strategy is 'ai' — re-parsing this form with AI (ignoring any existing cache).")

    await reveal_form(page, StandardFields(), log)
    form = await discover_form(page, log)
    save_platform_fields(cache_dir, hostname, form.standard)
    save_job_questions(cache_dir, hostname, job, form.screening_questions)
    log(f"Saved the field map to {cache_dir} — future runs against this source will skip straight to DOM filling.")
    return form


async def run(args: argparse.Namespace) -> int:
    load_dotenv(SCRIPT_DIR / ".env")

    provider = resolve_provider(args.model)
    env_var = PROVIDER_ENV_VARS.get(provider, f"{provider.upper()}_API_KEY")
    api_key = args.api_key or os.environ.get(env_var)
    if not api_key:
        log(f"ERROR: {env_var} is not set (required for --model {args.model}, provider '{provider}').")
        log(f"Copy python/.env.example to python/.env and set {env_var}=..., or pass --api-key directly.")
        return 1

    profile = load_profile(args.profile)
    resume_path = resolve_resume_path(profile)

    config = StagehandConfig(
        env="LOCAL",
        model_name=args.model,
        model_api_key=api_key,
        headless=not args.debug,
    )
    stagehand = Stagehand(config)
    log("Launching Chromium" + (" (visible — --debug)" if args.debug else " (headless)") + "...")
    await stagehand.init()
    page = stagehand.page

    try:
        log(f"Opening {args.url}")
        await page.goto(args.url, wait_until="domcontentloaded")

        cache_dir = Path(args.cache_dir)
        form = await get_or_discover_form(page, args.url, cache_dir, args.strategy)

        resume_text = extract_resume_text(resume_path)
        log("Filling the form...")
        report = await fill_application(
            page, form.standard, form.screening_questions, profile, resume_path, log,
            model=args.model, api_key=api_key, resume_text=resume_text,
        )

        print()
        log(
            f"Done. Filled {len(report.filled)} field(s) "
            f"({len(report.repaired_by_ai)} needed a live AI repair, {len(report.ai_answered)} needed an AI-generated answer), "
            f"skipped {len(report.skipped)}."
        )
        if report.unanswered_questions:
            log("Questions left unanswered — review these yourself before submitting:")
            for question in report.unanswered_questions:
                log(f"  - {question}")

        if args.submit:
            if not args.yes:
                answer = input(f"\nThis will submit a REAL application to:\n  {args.url}\nContinue? [y/N]: ").strip().lower()
                if answer != "y":
                    log("Submit cancelled.")
                    return 0
            log("Submitting...")
            submit_selector = normalize_selector(form.standard.submit_button_selector)
            try:
                if not submit_selector:
                    raise RuntimeError("no cached submit selector")
                await page.locator(submit_selector).click(timeout=3000)
            except Exception:
                await page.act("Click the Submit or Submit Application button")
            await page.wait_for_timeout(1500)
            log("Submitted — check the confirmation in the browser.")
        else:
            log('Not submitting (pass --submit to actually send it). The form is filled and waiting for your review.')

        if args.debug:
            input("\nPress Enter to close the browser...")
        return 0
    finally:
        await stagehand.close()


def main() -> None:
    args = parse_args()
    exit_code = asyncio.run(run(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
