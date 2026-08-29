# Greenhouse Auto-Apply Demo

A self-contained demo of automatically filling out a Greenhouse-style job application form
from a structured "applicant profile" object — no scraping of a real company's Greenhouse
board involved. It ships with:

- A **mock Greenhouse-style job posting** (`public/mock-job.html`) with the fields a typical
  Greenhouse application form asks for (contact info, resume upload, links, work
  authorization, EEOC self-identification, etc).
- A small **web UI** (`public/index.html`) with a *live, controllable* view of that form: a
  `<canvas>` streams the real headless page over a WebSocket, and your clicks, scrolling, and
  keystrokes on it are forwarded straight into that same browser — so you can fill in a field
  by hand, then click "Fill Fields" to have automation fill in the rest, on the same page.
- A **fill vs. submit split**: "Fill Fields" only populates the fields; whether it also submits
  is controlled by an "Auto-submit after filling" checkbox. Leave it off to review the form
  yourself and click "Submit Application" (or just click the real Submit button in the live
  view) when you're ready; turn it on for a fully hands-off run.
- Two interchangeable automation strategies for "Fill Fields":
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
Stagehand's page is a real Playwright `Page`, so mixing raw Playwright calls with AI actions
on the same page is fine.

## Testing against a real Greenhouse posting

The "Target job posting" field at the top of the UI defaults to the mock page, but you can
paste a real `job-boards.greenhouse.io/...` URL there to see how well each strategy's field
matching holds up against a real, unmodified form (real company forms word things differently
than the mock, e.g. exact EEOC option text, so **expect Heuristic to match noticeably fewer
fields than AI** — that's the point of comparing them).

Submitting to a real posting is **hard-disabled**, not just hidden in the UI:
- The "Auto-submit" checkbox and "Submit Application" button are disabled whenever the
  session's target isn't this app's own mock page.
- More importantly, every session for a non-local target installs a Playwright
  `page.route("**/*", ...)` handler that **aborts every request that isn't GET/HEAD** before
  it leaves the browser. This closes the real gap: the live view forwards your raw clicks
  straight into the page, so a manual click on the *real* Submit button would otherwise still
  fire — the network-level block is what actually guarantees no application ever reaches a
  real employer, regardless of what triggered the click (our own code, the AI, or you).
  The trade-off is that this can also block harmless non-GET requests the page makes for its
  own rendering (an analytics beacon, a POST-based GraphQL query) — acceptable for a hard
  safety guarantee, but worth knowing if a real posting looks partially broken while testing.

This was built and typechecked in a sandboxed environment whose network policy blocks
reaching arbitrary external sites, so it could not be exercised against a real, live Greenhouse
posting end-to-end here — only against a local stand-in. Try it against a real posting on a
machine with normal internet access to see how it actually behaves.

## How the live view works

Picking a strategy opens a **session**: a real headless Chromium page that stays open on the
server for as long as you're using it (instead of a fresh browser per click). The UI connects
to it over a WebSocket at `/ws/session/:id`, which does two things:

- Streams a JPEG screenshot of the page a few times a second (plus immediately after every
  input), which the UI draws onto the `<canvas>`.
- Forwards your `click`, `wheel` (scroll), and `key` events on the canvas into that same page
  via Playwright's `page.mouse` / `page.keyboard`.

"Fill Fields" runs the chosen strategy against that same open page — so anything you typed
manually is still there, and anything the strategy overwrites (every field the profile has a
value for) changes live in front of you. Switching strategy closes the old session (and its
browser) and opens a new one, since heuristic sessions use a plain Playwright page while AI
sessions use a Stagehand-wrapped one.

## Why Stagehand?

"Playwright with AI" most commonly refers to [Stagehand](https://www.stagehand.dev/) (by
Browserbase) — it's built directly on top of Playwright and keeps its familiar `page` API,
just adding AI-driven `act`/`extract`/`observe` methods. Other options exist (e.g.
`browser-use` in Python), but Stagehand is the closest match to "Playwright, plus AI" for a
TypeScript project.

## Setup

```bash
npm install
npx playwright install chromium   # one-time browser download
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
- Paste your own JSON directly into the textarea in the UI (it's just sent to `/api/session/:id/fill`
  as-is), or
- Replace `src/sampleProfile.ts` with your real data once you provide it, so it's
  pre-populated on load.

`resume.filePath` should point at a real resume file (PDF/DOCX/TXT) on disk, relative to the
project root.

## Project layout

```
src/
  server.ts                 Express app + WebSocket live view; session/fill/submit endpoints
  types.ts                  ApplicantProfile / request / event types
  sampleProfile.ts          Placeholder applicant profile
  automation/
    liveSession.ts          Opens/tracks/closes the per-strategy headless session; installs
                            the non-GET request block for external (real) targets
    heuristicStrategy.ts    Playwright-only, label-matching field fill (no browser lifecycle)
    stagehandStrategy.ts    Stagehand (AI) field fill (no browser lifecycle)
    formActions.ts          Shared submit-button click + confirmation-text reading
    liveView.ts             Shared viewport size + JPEG screenshot capture for the live view
    browserPath.ts          Resolves the sandbox's pre-installed Chromium when present
public/
  index.html, app.js, styles.css   Demo UI (live canvas, fill/submit controls)
  mock-job.html, mock-job.js       The target Greenhouse-style application form
sample-data/resume.txt      Placeholder resume uploaded during the demo
```

## Notes

- Browser launching resolves to a pre-installed Chromium binary at `/opt/pw-browsers/chromium`
  when present (this project's cloud dev sandbox ships one there); everywhere else — including
  a normal local checkout — it falls back to the Chromium Playwright installs itself via
  `npx playwright install chromium`.
- Idle sessions (no fill/submit/websocket activity for 10 minutes) are closed automatically so
  an abandoned tab doesn't leak a headless browser process.
- `/api/session/:id/fill` streams newline-delimited JSON (NDJSON) so the UI can show progress
  live instead of waiting for the whole run to finish.
