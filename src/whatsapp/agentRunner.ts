import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

// One Claude Code conversation per WhatsApp sender, plus a per-sender queue so two
// messages arriving close together never drive the same session concurrently.
interface SenderState {
  sessionId?: string;
  queue: Promise<unknown>;
}

const senderStates = new Map<string, SenderState>();

function getWorkspaceDir(): string {
  const configured = process.env.WHATSAPP_WORKSPACE_DIR || "whatsapp-workspace";
  return path.resolve(process.cwd(), configured);
}

function getMaxTurns(): number {
  const raw = Number(process.env.WHATSAPP_MAX_TURNS);
  return Number.isFinite(raw) && raw > 0 ? raw : 40;
}

// Runs one turn of a (possibly resumed) Claude Code session for `sender` and returns
// the final assistant text to relay back over WhatsApp.
export function runClaudeCodeTurn(sender: string, prompt: string): Promise<string> {
  const state = senderStates.get(sender) ?? { queue: Promise.resolve() };
  senderStates.set(sender, state);

  const run = state.queue.then(() => executeTurn(state, prompt));
  // Keep the chain alive even if this turn throws, so the next message isn't stuck
  // behind a permanently-rejected promise.
  state.queue = run.catch(() => undefined);
  return run;
}

async function executeTurn(state: SenderState, prompt: string): Promise<string> {
  let finalText = "";

  const stream = query({
    prompt,
    options: {
      cwd: getWorkspaceDir(),
      resume: state.sessionId,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: getMaxTurns(),
    },
  });

  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") {
      state.sessionId = message.session_id;
      continue;
    }
    if (message.type === "result") {
      state.sessionId = message.session_id;
      finalText =
        message.subtype === "success"
          ? message.result
          : `⚠️ Turn ended early (${message.subtype}). ${message.errors.join("; ")}`.trim();
    }
  }

  return finalText || "(Claude Code produced no output for that message.)";
}
