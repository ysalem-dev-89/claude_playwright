# apply.py — AI-first, DOM-cached job application filler

A standalone Python/Stagehand CLI, separate from the TypeScript backend in `../src`. Point it
at a real job posting URL and it fills the application form in a real browser. It costs an LLM
call only the *first* time it sees a given source (a platform, and separately each specific job
posting) — after that it replays the field map by plain Playwright DOM calls, no LLM involved,
until something on the page changes and a single field needs a live repair.

This is not a demo — there is no mock/sample page bundled here. It is meant to run against real
job postings on your own machine, with your own Anthropic API key.

## How it works

1. **Discovery (AI, once per source).** On a cache miss, `agent/discovery.py` clicks "Apply" if
   needed, then makes one Stagehand `extract()` call asking the model to map every field on the
   form: standard fields (name, email, phone, resume, cover letter, LinkedIn, portfolio, submit
   button) plus every other question (screening, EEO, custom) with its selector, type, options,
   and a best-guess classification of what it's asking.
2. **Two-tier cache (`agent/cache.py`).** The result is split and saved to disk as JSON:
   - **Platform tier** (`cache/platforms/<hostname>.json`) — the standard fields. These come
     from the same underlying form component for every employer on a given ATS (e.g. every job
     on `jobs.workable.com`), so they're safe to reuse across postings on the same host.
   - **Job tier** (`cache/jobs/<hostname>/<job-id>.json`) — the screening/EEO/custom questions.
     These are configured per employer/posting and are kept separate per job so an answer never
     lands in the wrong question on a different posting.
3. **Fill (DOM, every run after the first).** `agent/filler.py` fills every field with plain
   Playwright locators — no LLM — pacing each field with a short delay so you can watch it fill
   gradually. Select/radio answers are matched against the real option text with an
   exact-match → substring → common opt-out-phrase fallback, since real forms rarely spell an
   option exactly like your profile data does.
4. **AI repair (fallback only).** If a cached selector no longer matches anything (the page
   changed, or the platform's DOM has quirks the first pass didn't fully capture), that one
   field falls back to a live Stagehand `act()` call instead of failing outright.
5. **Review, then optionally submit.** By default the script fills and stops so you can review
   the form yourself. Pass `--submit` to actually click Submit (with a confirmation prompt
   unless you also pass `--yes`).

This generalizes beyond Workable: any job source works the same way — first run on a new
hostname pays for one AI discovery pass, every run after that (including other job postings on
the same host) is DOM-only except for the per-job screening questions, which get their own one-
time discovery pass the first time you use that specific posting.

## Setup

```bash
cd python
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python -m playwright install chromium

cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

Then copy `profile.example.json` to your own profile and fill in your real information:

```bash
cp profile.example.json my-profile.json
# edit my-profile.json — your name, email, phone, resume path, links, EEO answers, etc.
```

`resume.file_path` is resolved relative to this `python/` directory (or pass an absolute path).

## Usage

```bash
# Fill only, visible browser, review before deciding to submit yourself:
python apply.py "https://jobs.workable.com/view/<id>/<slug>" --debug --profile my-profile.json

# Force a fresh AI discovery pass even if a cache entry exists (e.g. the site changed):
python apply.py "<job url>" --strategy ai --profile my-profile.json

# Actually submit once you've reviewed the fill (asks for confirmation first):
python apply.py "<job url>" --submit --profile my-profile.json

# Non-interactive submit (CI/scripted use — skips the confirmation prompt):
python apply.py "<job url>" --submit --yes --profile my-profile.json
```

### Flags

| Flag | Effect |
|---|---|
| `url` (positional) | The job posting URL to open. |
| `--debug` | Launches a real, visible (headed) Chromium window instead of headless, and pauses with `Press Enter to close...` before closing so you can watch it fill and inspect the result. |
| `--profile PATH` | Your applicant profile JSON. Defaults to the bundled placeholder (`profile.example.json`) — replace it before using `--submit` for real. |
| `--strategy {auto,ai}` | `auto` (default): reuse the cache if present, else discover via AI and save it. `ai`: always re-discover fresh this run (still updates the cache). |
| `--submit` | Click Submit after filling. Without it the script only fills and leaves the form for you to review. |
| `--yes` | Skip the "are you sure" prompt before a real `--submit`. |
| `--model` | Override the model used for discovery/repair (default `claude-3-7-sonnet-latest`, or `$STAGEHAND_MODEL`). |
| `--cache-dir` | Override where the field-map cache is stored (default: `python/cache/`). |

## What was and wasn't verified here

This was built in a sandboxed environment with two hard constraints, disclosed here rather than
glossed over:

- **No outbound network access to job boards.** `jobs.workable.com` and every other ATS domain
  touched by this project are blocked by this sandbox's egress policy, so the discovery/fill
  logic could not be run against a real live Workable posting from here. The exact field
  selectors and form structure Workable uses were researched via web search rather than direct
  inspection, which is exactly why the AI-discovery step exists — it inspects the real DOM live
  on your machine instead of relying on selectors baked in ahead of time.
- **No `ANTHROPIC_API_KEY` in this sandbox**, so the Stagehand `extract()`/`act()` calls
  (discovery and AI-repair) could not be exercised end-to-end here either.

What **was** verified, mechanically, against a real headless Chromium browser:

- The CLI parses all flags correctly (`python apply.py --help`) and fails fast with a clear
  error when `ANTHROPIC_API_KEY` is missing, before ever launching a browser.
- The two-tier cache (`agent/cache.py`) correctly derives the platform key and job key from a
  real Workable job URL, writes both tiers to disk, and reloads them.
- `agent/filler.py`'s DOM-fill path was run against a throwaway local test form covering every
  field type (text, email, tel, url, textarea, file upload, select, radio group) and correctly
  filled all of them from a `ApplicantProfile`, including select/radio option-text matching
  against real (differently-worded) option labels.
  - resume upload was set via a locator's real `set_input_files`, not mocked.
  - a deliberately broken selector was included to confirm the AI-repair fallback actually
    triggers on a DOM failure (it did — it then failed, as expected, since no live Stagehand
    session/API key was available in that test, and the field correctly landed in `skipped`
    rather than crashing the run).

Before relying on this against a real posting, run once with `--debug` (no `--submit`) so you
can watch the fill happen and check the result yourself before ever adding `--submit`.
