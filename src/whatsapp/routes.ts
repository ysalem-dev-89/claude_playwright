import type { Express, Request, Response } from "express";
import { isSenderAllowed, verifyWebhookSignature } from "./security";
import { sendWhatsAppText } from "./whatsappClient";
import { runClaudeCodeTurn } from "./agentRunner";
import { WhatsAppWebhookPayload } from "./types";

// Registers the WhatsApp Cloud API webhook, which lets an allowlisted phone number
// drive a Claude Code session by text message. Requires WHATSAPP_VERIFY_TOKEN,
// WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and
// WHATSAPP_ALLOWED_NUMBERS to be set — see .env.example. No-ops (routes still respond,
// but every message is rejected) if the allowlist or app secret is missing.
export function registerWhatsAppRoutes(app: Express): void {
  // Meta's one-time webhook verification handshake.
  app.get("/webhook/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(challenge));
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/webhook/whatsapp", (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signatureOk = rawBody && verifyWebhookSignature(rawBody, req.header("X-Hub-Signature-256"));
    if (!signatureOk) {
      res.sendStatus(401);
      return;
    }

    // Ack immediately: Meta retries the webhook if it doesn't get a fast 200, and a
    // Claude Code turn can easily take longer than that retry window.
    res.sendStatus(200);
    handleIncomingWebhook(req.body as WhatsAppWebhookPayload).catch((err) => {
      console.error("Error handling WhatsApp webhook payload:", err);
    });
  });
}

async function handleIncomingWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

  for (const message of messages) {
    if (message.type !== "text" || !message.text?.body) continue;
    await handleTextMessage(message.from, message.text.body);
  }
}

async function handleTextMessage(from: string, text: string): Promise<void> {
  if (!isSenderAllowed(from)) {
    console.warn(`Ignoring WhatsApp message from non-allowlisted sender: ${from}`);
    return;
  }

  try {
    await sendWhatsAppText(from, "⏳ Working on it...");
    const reply = await runClaudeCodeTurn(from, text);
    await sendWhatsAppText(from, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Claude Code turn failed for ${from}:`, err);
    await sendWhatsAppText(from, `⚠️ Something went wrong: ${message}`).catch(() => undefined);
  }
}
