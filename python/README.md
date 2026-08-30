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
4. **AI repair (fallback only, retried).** If a selector doesn't work, that one field falls
   back to a live Stagehand `act()` call — retried up to 3 times with progressively more
   specific instructions before it's given up on and logged, rather than failing after one try.
5. **AI answer generation (for questions the profile doesn't cover).** A screening question
   that isn't one of the standard profile fields (an open-ended "why this role", a custom
   employer question, a yes/no the profile doesn't model) is *not* left blank: a second, cheap
   AI pass (`agent/answering.py`, one plain-text call, no DOM/page access needed) is asked to
   write a short, honest answer grounded in your actual profile JSON and resume text, then that
   answer is filled in like any other value. It's told explicitly not to invent credentials you
   don't have — a question about a clearance you don't hold gets answered "No", not a lie.
6. **Reveal the form on every run, not just the first.** The Apply button is clicked before
   filling whether or not this is a cache hit — using the cached button selector (DOM only) if
   one was learned, falling back to AI only if that selector no longer works or none was cached
   yet. You should never need to click Apply yourself.
7. **Review, then optionally submit.** By default the script fills and stops so you can review
   the form yourself. Pass `--submit` to actually click Submit (with a confirmation prompt
   unless you also pass `--yes`).

### Numeric-id selectors

Real ATS DOMs (Workable included) often use bare-numeric element ids, e.g. `id="778"`. A naive
`#778` CSS selector is invalid — a CSS identifier can't start with a digit — so every selector
is normalized (`agent/selectors.py`) to the equivalent `[id="778"]` attribute-selector form
before use, both for freshly-discovered selectors and for ones already sitting in an older
cache file. Without this, every single field on a form using numeric ids would fail its DOM
fill and silently fall back to a full AI repair every run, defeating the cache.

This generalizes beyond Workable: any job source works the same way — first run on a new
hostname pays for one AI discovery pass, every run after that (including other job postings on
the same host) is DOM-only except for the per-job screening questions, which get their own one-
time discovery pass the first time you use that specific posting.

### On leaving nothing blank

The goal is a fully-filled form with no manual intervention: every standard field, every
screening question matched to a profile value, and every remaining open-ended/custom question
answered by the AI-answer pass. A field only ends up in `unanswered_questions` (printed at the
end of a run) if the AI-answer call itself fails (e.g. no network, invalid key) — check that
list before using `--submit`. A field lands in `skipped` only if 3 DOM attempts *and* 3 AI
repair attempts all failed to interact with it at all (a genuinely broken/hidden element) —
also worth reviewing before submitting.

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
It defaults to the bundled `sample-data/resume.docx` — a placeholder in `.docx` format (rather
than plain `.txt`) since real application forms commonly reject `.txt` uploads outright. Point
it at your real resume (`.pdf`, `.doc`, or `.docx`) before submitting anything for real.

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
| `--model` | `<provider>/<model>` string (default `anthropic/claude-3-7-sonnet-latest`, or `$STAGEHAND_MODEL`). See **Choosing an LLM provider** below. |
| `--api-key` | Pass the model API key directly instead of via env var (useful for a provider not in the built-in table, or a differently-named key). |
| `--cache-dir` | Override where the field-map cache is stored (default: `python/cache/`). |

## Choosing an LLM provider

Stagehand resolves models through [litellm](https://docs.litellm.ai/docs/providers), so any
provider litellm supports works here — pass `--model <provider>/<model>` and set that provider's
API key. The script reads the key from the matching env var automatically based on the provider
prefix in `--model`; no code changes needed to switch providers.

| Provider | `--model` example | Env var |
|---|---|---|
| Anthropic (default) | `anthropic/claude-3-7-sonnet-latest` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai/gpt-4o` | `OPENAI_API_KEY` |
| Novita | `novita/deepseek/deepseek-v3` (see [novita.ai/models](https://novita.ai/models) for IDs) | `NOVITA_API_KEY` |
| Google | `gemini/gemini-2.0-flash` | `GOOGLE_API_KEY` |
| Groq | `groq/llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| OpenRouter | `openrouter/<model>` | `OPENROUTER_API_KEY` |

```bash
# OpenAI instead of the default:
python apply.py "<job url>" --model openai/gpt-4o --debug --profile my-profile.json

# Novita:
python apply.py "<job url>" --model novita/deepseek/deepseek-v3 --debug --profile my-profile.json
```

Set only the env var for the provider you're actually using in `.env` (see `.env.example`) — you
don't need every key populated, just the one matching `--model`. For a provider not in the table
above, the script derives the env var name as `<PROVIDER>_API_KEY`; if that's wrong for your
provider, pass `--api-key` directly instead.

Note: the discovery step asks the model to return structured JSON (a Pydantic schema) via
function/tool calling, so it works best with models that support that reliably — the frontier
models from each provider above do. A smaller/less capable model may parse forms less accurately
and lean more on the AI-repair fallback during filling.

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

- The CLI parses all flags correctly (`python apply.py --help`) and fails fast with a clear,
  provider-specific error when the relevant API key env var is missing, before ever launching a
  browser.
- The two-tier cache (`agent/cache.py`) correctly derives the platform key and job key from a
  real Workable job URL, writes both tiers to disk, and reloads them.
- The exact bug reported from a real run against a live Workable posting — every field failing
  with `SyntaxError: '#778' is not a valid selector` because Workable uses bare-numeric element
  ids — was reproduced against a real Chromium page (confirmed the raw `#778` selector throws)
  and confirmed fixed by `agent/selectors.py`'s normalization to `[id="778"]`.
- `agent/filler.py`'s DOM-fill path was run against a throwaway local test form covering every
  field type (text, email, tel, url, textarea, file upload, select, radio group, and a
  numeric-id select) and correctly filled all of them from an `ApplicantProfile`, including
  select/radio option-text matching against real (differently-worded) option labels.
  - resume upload was set via a locator's real `set_input_files`, using the bundled
    `sample-data/resume.docx` (confirmed to be a valid, readable `.docx`), not mocked.
- The AI-repair retry loop was unit-tested in isolation (fake page whose `act()` fails N times):
  confirmed it recovers on attempt 2 or 3 when a later attempt succeeds, and gives up after
  exactly 3 attempts (never more, never fewer) when it never does.
- The AI-answer fallback (`agent/answering.py`) for a screening question with no matching
  profile field was exercised against the real Anthropic API from this sandbox (using a fake
  key) — it made a real network call, got a real `AuthenticationError` back, logged it, and the
  question correctly landed in `unanswered_questions` instead of crashing the run. This
  confirms the failure path is clean; a real key would have produced a real generated answer
  instead (not verified here, since no real key is available in this sandbox).

Before relying on this against a real posting, run once with `--debug` (no `--submit`) so you
can watch the fill happen and check the result yourself before ever adding `--submit`.
