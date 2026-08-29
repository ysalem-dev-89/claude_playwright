import crypto from "node:crypto";

// Numbers allowed to drive Claude Code from WhatsApp, e.g. "15551234567,15559876543".
// Anyone else's messages are ignored — this bridge grants shell/file access, so the
// allowlist is the only thing standing between "my phone" and "anyone with your number".
export function getAllowedSenders(): Set<string> {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS || "";
  return new Set(
    raw
      .split(",")
      .map((n) => n.trim().replace(/^\+/, ""))
      .filter(Boolean)
  );
}

export function isSenderAllowed(from: string): boolean {
  const allowed = getAllowedSenders();
  if (allowed.size === 0) return false; // fail closed: no allowlist configured means nobody is allowed
  return allowed.has(from.replace(/^\+/, ""));
}

// Verifies Meta's X-Hub-Signature-256 header against the raw request body using the
// app secret, so the /webhook/whatsapp endpoint can't be driven by forged requests.
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false; // fail closed: no secret configured means signatures can't be checked
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
