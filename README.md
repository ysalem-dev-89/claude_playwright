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
    liveSession.ts          Opens/tracks/closes the per-strategy headless session
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

## Controlling Claude Code from WhatsApp

The server also exposes a small **WhatsApp -> Claude Code bridge**: text a message
to your WhatsApp Business number and it's run as a prompt against a real Claude
Code session (via the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)),
with the final response texted back. Each phone number gets its own persistent
session (via `resume`), so a conversation can span multiple messages.

**This grants shell and filesystem access on this machine to whoever texts an
allowlisted number.** Only enable it for your own number, on a machine you're
comfortable letting yourself remote-control.

### Setup

1. Create a [Meta developer app](https://developers.facebook.com/apps/) with the
   **WhatsApp** product added. The "API Setup" page gives you a temporary access
   token, a test phone number, and a **Phone Number ID**.
2. Set in `.env`:
   - `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` — from API Setup.
   - `WHATSAPP_APP_SECRET` — from the app's Settings > Basic page.
   - `WHATSAPP_VERIFY_TOKEN` — any string you make up.
   - `WHATSAPP_ALLOWED_NUMBERS` — your phone number(s), comma-separated, no `+`
     (e.g. `15551234567`). **Required** — every other sender is ignored.
3. Expose this server's `/webhook/whatsapp` publicly (e.g. `ngrok http 3000` while
   developing) and configure that URL + your `WHATSAPP_VERIFY_TOKEN` as the app's
   webhook callback, subscribed to the `messages` field.
4. From WhatsApp, message your test number. You'll get a quick "Working on it..."
   ack, then Claude Code's reply once the turn finishes.

### How it works

- `src/whatsapp/routes.ts` — `/webhook/whatsapp` GET (Meta's verification
  handshake) and POST (verifies `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`
  using the raw request body, acks immediately since Claude Code turns can run
  long, then processes the message asynchronously).
- `src/whatsapp/security.ts` — the sender allowlist and webhook signature check.
- `src/whatsapp/agentRunner.ts` — runs one turn via `query()` from
  `@anthropic-ai/claude-agent-sdk` with `permissionMode: "bypassPermissions"`
  (there's no one to interactively approve a tool-use prompt from WhatsApp),
  scoped to a dedicated `whatsapp-workspace/` working directory, and keeps a
  per-sender session id for multi-turn continuity. Messages from the same sender
  are queued so two never drive the same session concurrently.
- `src/whatsapp/whatsappClient.ts` — sends replies via the Cloud API's `/messages`
  endpoint, splitting anything over WhatsApp's 4096-character limit.

## Notes

- Browser launching resolves to a pre-installed Chromium binary at `/opt/pw-browsers/chromium`
  when present (this project's cloud dev sandbox ships one there); everywhere else — including
  a normal local checkout — it falls back to the Chromium Playwright installs itself via
  `npx playwright install chromium`.
- Idle sessions (no fill/submit/websocket activity for 10 minutes) are closed automatically so
  an abandoned tab doesn't leak a headless browser process.
- `/api/session/:id/fill` streams newline-delimited JSON (NDJSON) so the UI can show progress
  live instead of waiting for the whole run to finish.
