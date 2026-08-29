// Thin wrapper around the WhatsApp Cloud API's "send message" endpoint.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

const GRAPH_API_VERSION = "v21.0";
const WHATSAPP_TEXT_LIMIT = 4096;

function graphUrl(path: string): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set.");
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}${path}`;
}

async function graphPost(path: string, body: unknown): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN is not set.");

  const res = await fetch(graphUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp API request to ${path} failed: ${res.status} ${detail}`);
  }
}

// Splits on the API's hard per-message character limit; only kicks in for very long
// Claude Code outputs (long tool logs, big diffs), not ordinary replies.
function chunkText(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) chunks.push(text.slice(i, i + limit));
  return chunks;
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  for (const chunk of chunkText(trimmed)) {
    await graphPost("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: chunk },
    });
  }
}

export async function markWhatsAppMessageRead(messageId: string): Promise<void> {
  await graphPost("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}
