import "dotenv/config";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { sampleProfile } from "./sampleProfile";
import { createSession, getSession, closeSession, LiveSession } from "./automation/liveSession";
import { fillHeuristicFields } from "./automation/heuristicStrategy";
import { fillAiFields } from "./automation/stagehandStrategy";
import { runWorkdayHeuristicSteps } from "./automation/workdayStrategy";
import { runWorkdayAiSteps } from "./automation/workdayStagehandStrategy";
import { getCredential, saveCredential } from "./automation/credentialStore";
import { clickSubmit, waitForConfirmation } from "./automation/formActions";
import { captureFrameDataUrl } from "./automation/liveView";
import { ApplicantProfile, CreateSessionRequest, FillRequest, RunEvent } from "./types";
import { RunLogger } from "./automation/logger";

const MOCK_JOB_PATH: Record<"greenhouse" | "workday", string> = {
  greenhouse: "/mock-job.html",
  workday: "/mock-workday-job.html",
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/sample-profile", (_req, res) => {
  res.json(sampleProfile);
});

app.get("/api/ai-available", (_req, res) => {
  res.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/session", async (req, res) => {
  const body = req.body as Partial<CreateSessionRequest>;
  if (body.strategy !== "heuristic" && body.strategy !== "ai") {
    res.status(400).json({ error: "Request body must include { strategy: 'heuristic' | 'ai' }." });
    return;
  }
  if (body.platform !== "greenhouse" && body.platform !== "workday") {
    res.status(400).json({ error: "Request body must include { platform: 'greenhouse' | 'workday' }." });
    return;
  }

  const localOrigin = `${req.protocol}://${req.get("host")}`;
  const mockJobUrl = `${localOrigin}${MOCK_JOB_PATH[body.platform]}`;
  const requestedUrl = body.jobUrl?.trim();

  let jobUrl = mockJobUrl;
  let isExternal = false;
  if (requestedUrl) {
    let parsed: URL;
    try {
      parsed = new URL(requestedUrl);
    } catch {
      res.status(400).json({ error: "Target URL is not a valid URL." });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ error: "Target URL must be http:// or https://." });
      return;
    }
    jobUrl = parsed.toString();
    isExternal = parsed.origin !== localOrigin;
  }

  try {
    const session = await createSession(body.strategy, body.platform, jobUrl, isExternal);
    res.json({ sessionId: session.id, isExternal });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/session/:id", async (req, res) => {
  await closeSession(req.params.id);
  res.status(204).end();
});

app.post("/api/session/:id/fill", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired — start a new one." });
    return;
  }

  const body = req.body as Partial<FillRequest>;
  if (!body.profile) {
    res.status(400).json({ error: "Request body must include { profile }." });
    return;
  }
  const profile = body.profile as ApplicantProfile;
  const autoSubmit = Boolean(body.autoSubmit) && !session.isExternal;

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "Transfer-Encoding": "chunked",
  });
  const emit = (event: RunEvent) => res.write(JSON.stringify(event) + "\n");
  const log: RunLogger = (level, message) => emit({ type: "log", level, message, timestamp: Date.now() });

  if (Boolean(body.autoSubmit) && session.isExternal) {
    log("warn", "Auto-submit is disabled for external targets — this demo never submits to a real job posting. Fill only.");
  }

  try {
    if (session.platform === "workday") {
      const existingCredential = getCredential(session.hostname);
      const account =
        session.strategy === "ai"
          ? await runWorkdayAiSteps(session.page, profile, existingCredential, log)
          : await runWorkdayHeuristicSteps(session.page, profile, existingCredential, log);

      if (account.isNewAccount) {
        saveCredential(session.hostname, account.email, account.password);
        log("info", `Saved the new account for ${session.hostname} — future runs against this employer will sign in instead of registering again.`);
      }
    } else if (session.strategy === "ai") {
      await fillAiFields(session.page, profile, log);
    } else {
      await fillHeuristicFields(session.page, profile, log);
    }

    if (autoSubmit) {
      log("info", "Submitting application...");
      await clickSubmit(session.page);
      const confirmationText = await waitForConfirmation(session.page);
      log("success", "Application submitted successfully.");
      emit({ type: "done", success: true, message: "Application submitted successfully.", confirmationText });
    } else {
      log("success", "Fields filled.");
      emit({
        type: "done",
        success: true,
        message: "Fields filled. Click \"Submit Application\" when you're ready (or submit it yourself in the live view).",
        awaitingManualSubmit: true,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", message);
    emit({ type: "done", success: false, message });
  }
  res.end();
});

app.post("/api/session/:id/submit", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired — start a new one." });
    return;
  }
  if (session.isExternal) {
    res.status(403).json({ success: false, error: "Submission is disabled for external targets — this demo never submits to a real job posting." });
    return;
  }
  try {
    await clickSubmit(session.page);
    const confirmationText = await waitForConfirmation(session.page);
    res.json({ success: true, confirmationText });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Greenhouse apply demo running at http://localhost:${PORT}`);
});

// Live, bidirectional view of a session's page: streams JPEG frames to the browser and
// forwards the user's clicks/scrolls/keystrokes into the real headless page, so the same
// page can be driven by a human and by fillHeuristicFields/fillAiFields interchangeably.
const wss = new WebSocketServer({ noServer: true });
const FRAME_INTERVAL_MS = 300;

server.on("upgrade", (req, socket, head) => {
  const match = (req.url || "").match(/^\/ws\/session\/([^/?]+)/);
  const session = match ? getSession(match[1]) : undefined;
  if (!session) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => attachLiveSocket(ws, session));
});

function attachLiveSocket(ws: WebSocket, session: LiveSession) {
  const sendFrame = async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      const imageDataUrl = await captureFrameDataUrl(session.page);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "frame", imageDataUrl }));
    } catch {
      // page may be mid-navigation/closed for this tick — next interval tick will retry
    }
  };

  sendFrame();
  const interval = setInterval(sendFrame, FRAME_INTERVAL_MS);

  ws.on("message", async (raw) => {
    let msg: { type?: string; x?: number; y?: number; deltaY?: number; key?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      if (msg.type === "click" && typeof msg.x === "number" && typeof msg.y === "number") {
        await session.page.mouse.click(msg.x, msg.y);
      } else if (msg.type === "wheel" && typeof msg.deltaY === "number") {
        await session.page.mouse.wheel(0, msg.deltaY);
      } else if (msg.type === "key" && msg.key) {
        await session.page.keyboard.press(msg.key);
      }
      sendFrame();
    } catch {
      // unsupported key name or the page rejected the input — safe to ignore for a demo
    }
  });

  ws.on("close", () => clearInterval(interval));
}
