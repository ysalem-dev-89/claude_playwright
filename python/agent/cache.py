"""Two-tier JSON cache so a job source only needs an AI parse once.

Tier 1 — platform (keyed by hostname, e.g. "jobs.workable.com"): the standard fields
(name/email/phone/resume/...) are rendered by the same underlying form component for every
employer on that ATS, so discovering them once is safe to reuse across any job posting on the
same host.

Tier 2 — job (keyed by hostname + a stable id extracted from the job URL): screening/EEO
questions are configured per employer/per posting and must NOT be shared across different jobs,
even on the same host, or answers would end up in the wrong fields.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from .schema import ScreeningQuestion, StandardFields

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"

# Matches Workable's /view/<id>/... and similar single-token job-id path segments used by
# other ATSs (Greenhouse's /jobs/<id>, Lever's /<id>, ...); falls back to hashing the full URL
# for anything that doesn't look like one of these.
_JOB_ID_PATTERNS = [
    re.compile(r"/view/([A-Za-z0-9]+)"),
    re.compile(r"/jobs?/([A-Za-z0-9]+)"),
]


def platform_key(url: str) -> str:
    return urlparse(url).netloc.lower()


def job_key(url: str) -> str:
    path = urlparse(url).path
    for pattern in _JOB_ID_PATTERNS:
        match = pattern.search(path)
        if match:
            return match.group(1)
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def _platform_path(cache_dir: Path, hostname: str) -> Path:
    return cache_dir / "platforms" / f"{hostname}.json"


def _job_path(cache_dir: Path, hostname: str, job: str) -> Path:
    return cache_dir / "jobs" / hostname / f"{job}.json"


def load_platform_fields(cache_dir: Path, hostname: str) -> StandardFields | None:
    path = _platform_path(cache_dir, hostname)
    if not path.exists():
        return None
    try:
        return StandardFields.model_validate_json(path.read_text())
    except Exception:
        return None


def save_platform_fields(cache_dir: Path, hostname: str, fields: StandardFields) -> None:
    path = _platform_path(cache_dir, hostname)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(fields.model_dump_json(indent=2))


def load_job_questions(cache_dir: Path, hostname: str, job: str) -> list[ScreeningQuestion] | None:
    path = _job_path(cache_dir, hostname, job)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text())
        return [ScreeningQuestion.model_validate(item) for item in raw]
    except Exception:
        return None


def save_job_questions(cache_dir: Path, hostname: str, job: str, questions: list[ScreeningQuestion]) -> None:
    path = _job_path(cache_dir, hostname, job)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([q.model_dump() for q in questions], indent=2))
