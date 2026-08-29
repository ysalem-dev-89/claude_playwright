# Auto-Apply Demo

A self-contained demo of automatically filling out job application forms from a structured
"applicant profile" object — no scraping of a real company's real ATS involved unless you
deliberately point it at one (see "Testing against a real posting" below). It ships with:

- **Two platforms**, each with its own mock job posting modeled on a real ATS's typical flow:
  - **Greenhouse** (`public/mock-job.html`) — one long single-page form: contact info, resume
    upload, links, work authorization, EEOC self-identification, then a single Submit button.
  - **Workday** (`public/mock-workday-job.html`) — a multi-step wizard: sign in or create an
    account, then My Information → My Experience (repeatable work history/education) →
    Application Questions → Voluntary Disclosures → Self Identify → Review, before a final
    Submit.
- A small **web UI** (`public/index.html`) with a *live, controllable* view of whichever form
  is active: a `<canvas>` streams the real headless page over a WebSocket, and your clicks,
  scrolling, and keystrokes on it are forwarded straight into that same browser — so you can
  fill in a field by hand, then click "Fill Fields" to have automation fill in the rest, on the
  same page.
- A **fill vs. submit split**: "Fill Fields" only populates the fields; whether it also submits
  is controlled by an "Auto-submit after filling" checkbox. Leave it off to review the form
  yourself and click "Submit Application" (or just click the real Submit button in the live
  view) when you're ready; turn it on for a fully hands-off run.
- Two interchangeable automation strategies for "Fill Fields":
  - **Heuristic** — plain [Playwright](https://playwright.dev/), matches each form field to a
    profile value by its `<label>` text (Greenhouse) or by fixed selectors tuned to this app's
    own Workday mock. Deterministic, free, but brittle if the form's wording/structure changes.
  - **AI** — [Stagehand](https://www.stagehand.dev/), which wraps Playwright and adds
    `act()` / `extract()` / `observe()`: you describe what to do in plain English ("Type
    'Jordan' into the First Name field") and an LLM (Claude, via `ANTHROPIC_API_KEY`) figures
    out which element to interact with. More resilient to layout/wording changes, at the cost
    of needing an API key and being slower/non-deterministic.

Both strategies fall back to a direct Playwright call for the resume file upload, since
native OS file choosers aren't something an LLM-driven `act()` call can drive reliably —
Stagehand's page is a real Playwright `Page`, so mixing raw Playwright calls with AI actions
on the same page is fine.

## Workday: accounts are handled for you

Workday requires a candidate account before you can apply. "Fill Fields" handles this without
asking:
- **First time** applying to a given employer (tracked by the target's hostname, e.g.
  `nextracker.wd5.myworkdayjobs.com`): it registers a new account using the profile's email and
  an auto-generated password, then saves that login locally (`data/workday-credentials.json`,
  gitignored — plaintext JSON, fine for a local demo, **not** how you'd store real candidate
  credentials in production).
- **Every time after**, against that same employer: it signs in with the saved credentials
  instead of registering again.

Different employers' Workday tenants never share an account — the store is keyed by hostname.

## Testing against a real posting

The "Target job posting" field defaults to the current platform's mock page, but you can paste
a real URL there — a `job-boards.greenhouse.io/...` posting, or a `myworkdayjobs.com` one — to
see how well each strategy's field matching holds up against a real, unmodified form. Real
company forms word things differently than the mocks (exact EEOC option text, custom
questions, etc.), so **expect Heuristic to match noticeably fewer fields than AI** — especially
on Workday, where the heuristic strategy's selectors are tuned specifically to this app's own
mock and will very likely need adjusting for a real tenant's actual DOM. That gap is exactly
what the AI strategy is for.

Submitting to a real posting — and, for Workday, actually registering a real account — is
**hard-disabled**, not just hidden in the UI:
- The "Auto-submit" checkbox and "Submit Application" button are disabled whenever the
  session's target isn't one of this app's own mock pages.
- More importantly, every session for a non-local target installs a Playwright
  `page.route("**/*", ...)` handler that **aborts every request that isn't GET/HEAD** before
  it leaves the browser. This closes the real gap: the live view forwards your raw clicks
  straight into the page, so a manual click on the *real* Submit (or Create Account) button
  would otherwise still fire — the network-level block is what actually guarantees neither an
  application nor a real account ever reaches a real employer, regardless of what triggered the
  click (our own code, the AI, or you). On Workday specifically this means account
  registration is a POST, so a real tenant's flow will get through the read-only pages and then
  genuinely stop at the account step until you relax this yourself — that's deliberate, not a
  bug. The trade-off is that this can also block harmless non-GET requests a page makes for its
  own rendering (an analytics beacon, a POST-based GraphQL query) — acceptable for a hard
  safety guarantee, but worth knowing if a real posting looks partially broken while testing.

This was built and typechecked in a sandboxed environment whose network policy blocks reaching
arbitrary external sites (confirmed for both `job-boards.greenhouse.io` and, presumably,
`myworkdayjobs.com`), so none of it could be exercised against a real, live posting end-to-end
here — only against local stand-ins. Try it against a real posting on a machine with normal
internet access to see how it actually behaves.

## How the live view works

Picking a platform + strategy opens a **session**: a real headless Chromium page that stays
open on the server for as long as you're using it (instead of a fresh browser per click). The
UI connects to it over a WebSocket at `/ws/session/:id`, which does two things:

- Streams a JPEG screenshot of the page a few times a second (plus immediately after every
  input), which the UI draws onto the `<canvas>`.
- Forwards your `click`, `wheel` (scroll), and `key` events on the canvas into that same page
  via Playwright's `page.mouse` / `page.keyboard`.

"Fill Fields" runs the chosen strategy against that same open page — so anything you typed
manually is still there, and anything the strategy overwrites (every field the profile has a
value for) changes live in front of you. Switching platform or strategy closes the old session
(and its browser) and opens a new one, since heuristic sessions use a plain Playwright page
while AI sessions use a Stagehand-wrapped one, and Greenhouse/Workday need different fill logic
entirely.

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
  "personal": {
    "firstName": "...", "lastName": "...", "email": "...", "phone": "...", "location": "...",
    "address": { "line1": "...", "city": "...", "state": "...", "postalCode": "...", "country": "..." }
  },
  "links": { "linkedin": "...", "portfolio": "...", "github": "..." },
  "resume": { "fileName": "...", "filePath": "sample-data/resume.txt" },
  "workAuthorization": { "authorizedToWorkInUS": true, "requiresSponsorship": false },
  "coverLetter": "...",
  "additionalInfo": { "howDidYouHear": "...", "desiredSalary": "...", "availableStartDate": "..." },
  "eeoc": { "gender": "...", "raceEthnicity": "...", "veteranStatus": "...", "disabilityStatus": "..." },
  "workHistory": [{ "jobTitle": "...", "company": "...", "location": "...", "startDate": "...", "endDate": "...", "isCurrent": false, "description": "..." }],
  "education": [{ "school": "...", "degree": "...", "fieldOfStudy": "...", "graduationDate": "..." }]
}
```

`address`, `workHistory`, and `education` are only used by the Workday flow's My
Information/My Experience steps — Greenhouse ignores them.

You can either:
- Paste your own JSON directly into the textarea in the UI (it's just sent to
  `/api/session/:id/fill` as-is), or
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
    liveSession.ts          Opens/tracks/closes the per-strategy, per-platform headless
                             session; installs the non-GET request block for external targets
    heuristicStrategy.ts    Greenhouse: Playwright-only, label-matching field fill
    stagehandStrategy.ts    Greenhouse: Stagehand (AI) field fill
    workdayStrategy.ts      Workday: account step (register/sign-in) + heuristic field fill
                            for every wizard step, stopping at Review
    workdayStagehandStrategy.ts   Workday: same steps, AI-driven field fill
    workdaySteps.ts         Shared "wait for the next wizard step to render" helper
    credentialStore.ts      Local per-hostname login store for the Workday account step
    formActions.ts          Shared submit-button click + confirmation-text reading
    liveView.ts             Shared viewport size + JPEG screenshot capture for the live view
    browserPath.ts          Resolves the sandbox's pre-installed Chromium when present
public/
  index.html, app.js, styles.css        Demo UI (platform/strategy pickers, live canvas, log)
  mock-job.html, mock-job.js            Greenhouse-style application form
  mock-workday-job.html, mock-workday.js, mock-workday.css   Workday-style wizard
sample-data/resume.txt      Placeholder resume uploaded during the demo
data/workday-credentials.json   Gitignored; created on first Workday registration
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
- Playwright's locator actions (`.check()`, `.selectOption()`, etc.) retry for its default 30s
  timeout before giving up on a non-matching selector/value. Anywhere the code expects a value
  might not exactly match an option (e.g. `eeoc.disabilityStatus` wording varies by platform —
  Greenhouse's mock uses "I don't wish to answer", Workday's uses the CDC-standard "I do not
  want to answer"), it passes an explicit short `timeout` so a mismatch fails fast into its
  fallback instead of stalling the whole run.
