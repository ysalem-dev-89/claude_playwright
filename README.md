# Greenhouse Auto-Apply Demo

A self-contained demo of automatically filling out a Greenhouse-style job application form
from a structured "applicant profile" object — no scraping of a real company's Greenhouse
board involved. It ships with:

- A **mock Greenhouse-style job posting** (`public/mock-job.html`) with the fields a typical
  Greenhouse application form asks for (contact info, resume upload, links, work
  authorization, EEOC self-identification, etc).
- A small **web UI** (`public/index.html`) where you paste/edit a JSON applicant profile,
  pick a fill strategy, and watch a live log while a headless browser fills out and submits
  the form.
- Two interchangeable automation strategies:
  - **Heuristic** — plain [Playwright](https://playwright.dev/), matches each form field to a
    profile value by its `<label>` text. Deterministic, free, but brittle if the form's
    wording changes.
  - **AI** — [Stagehand](https://www.stagehand.dev/), which wraps Playwright and adds
    `act()` / `extract()` / `observe()`: you describe what to do in plain English ("Type
    'Jordan' into the First Name field") and an LLM (Claude, via `ANTHROPIC_API_KEY`) figures
    out which element to interact with. More resilient to layout/wording changes, at the cost
    of needing an API key and being slower/non-deterministic.

Both strategies fall back to a direct Playwright call for the resume file upload, since
native OS file choosers aren't something an LLM-driven `act()` call can drive reliably —
`stagehand.page` is a real Playwright `Page`, so mixing raw Playwright calls with AI actions
on the same page is fine.

## Why Stagehand?

"Playwright with AI" most commonly refers to [Stagehand](https://www.stagehand.dev/) (by
Browserbase) — it's built directly on top of Playwright and keeps its familiar `page` API,
just adding AI-driven `act`/`extract`/`observe` methods. Other options exist (e.g.
`browser-use` in Python), but Stagehand is the closest match to "Playwright, plus AI" for a
TypeScript project.

## Setup

```bash
npm install
cp .env.example .env   # optional, only needed for the AI strategy
npm run dev
```

Then open http://localhost:3000.

To use the **AI** strategy, put an Anthropic API key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, the AI option is disabled in the UI and the app works fully in **Heuristic**
mode.

## Using your real applicant data

The UI ships with a placeholder profile (`src/sampleProfile.ts`) shaped like this:

```jsonc
{
  "personal": { "firstName": "...", "lastName": "...", "email": "...", "phone": "...", "location": "..." },
  "links": { "linkedin": "...", "portfolio": "...", "github": "..." },
  "resume": { "fileName": "...", "filePath": "sample-data/resume.txt" },
  "workAuthorization": { "authorizedToWorkInUS": true, "requiresSponsorship": false },
  "coverLetter": "...",
  "additionalInfo": { "howDidYouHear": "...", "desiredSalary": "...", "availableStartDate": "..." },
  "eeoc": { "gender": "...", "raceEthnicity": "...", "veteranStatus": "...", "disabilityStatus": "..." }
}
```

You can either:
- Paste your own JSON directly into the textarea in the UI (it's just sent to `/api/apply`
  as-is), or
- Replace `src/sampleProfile.ts` with your real data once you provide it, so it's
  pre-populated on load.

`resume.filePath` should point at a real resume file (PDF/DOCX/TXT) on disk, relative to the
project root.

## Project layout

```
src/
  server.ts                 Express app: serves the UI + mock job page, exposes /api/apply
  types.ts                  ApplicantProfile / event types
  sampleProfile.ts          Placeholder applicant profile
  automation/
    runApplication.ts       Picks a strategy, manages screenshots, streams progress events
    heuristicStrategy.ts    Playwright-only, label-matching fill
    stagehandStrategy.ts    Stagehand (AI) fill
public/
  index.html, app.js, styles.css   Demo UI
  mock-job.html, mock-job.js       The target Greenhouse-style application form
sample-data/resume.txt      Placeholder resume uploaded during the demo
```

## Notes

- The pre-installed Chromium binary is used directly (`/opt/pw-browsers/chromium`) rather
  than triggering a Playwright browser download.
- `/api/apply` streams newline-delimited JSON (NDJSON) so the UI can show progress live
  instead of waiting for the whole run to finish.
