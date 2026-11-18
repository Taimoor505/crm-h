// CORE STUB (Taimoor owns WhatsApp). The brief says agent alerts and
// automation messages go through Taimoor's WhatsApp sender; this is the
// interface I call. His implementation should route by workspace (its own
// Cloud API number) and fall back to the platform number for agent alerts.

export interface TemplateMessage {
  /** Workspace whose number sends it; null = platform number (agent alerts). */
  workspaceId: string | null;
  to: string;               // E.164
  template: string;         // approved template name
  language: string;         // 'en', 'ur'
  params: string[];         // body {{1}}, {{2}}, ...
}

export interface WhatsAppSender {
  sendTemplate(msg: TemplateMessage): Promise<{ messageId: string }>;
}

/** Meta Cloud API with the platform number from env. */
const cloudApiSender: WhatsAppSender = {
  async sendTemplate(msg) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !token) throw new Error('WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are not set');
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: msg.template,
          language: { code: msg.language },
          components: msg.params.length
            ? [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text: text.slice(0, 1000) })) }]
            : [],
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !body.messages?.[0]?.id) {
      throw new Error(`WhatsApp send failed (${res.status}): ${body.error?.message ?? 'unknown error'}`);
    }
    return { messageId: body.messages[0].id };
  },
};

let sender: WhatsAppSender = cloudApiSender;
export const whatsapp = () => sender;
export function setWhatsAppSender(s: WhatsAppSender) {
  sender = s;
}
