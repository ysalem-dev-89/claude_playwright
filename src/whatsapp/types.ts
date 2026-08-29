// Minimal shape of a WhatsApp Cloud API webhook payload — only the fields this bridge reads.
// See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppInboundMessage[];
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
      };
    }>;
  }>;
}

export interface WhatsAppInboundMessage {
  from: string; // sender's phone number, no leading "+" (e.g. "15551234567")
  id: string;
  timestamp: string;
  type: string; // "text", "image", "audio", ...
  text?: { body: string };
}
