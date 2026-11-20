import { elevate } from '@/server/db';
import { json, userRoute } from '@/server/http';
import { decryptSecret } from '@/server/crypto';

// GET /whatsapp/templates: approved templates of the workspace's WhatsApp Business account (empty if none connected).
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ tx, workspace }) => {
  await elevate(tx);
  const [acct] = await tx<{ waba_id: string; token_ciphertext: string }[]>`
    select waba_id, token_ciphertext from public.whatsapp_accounts where workspace_id = ${workspace.id} and status <> 'disconnected' limit 1`;
  if (!acct) return json({ data: [], connected: false });
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${acct.waba_id}/message_templates?status=APPROVED&limit=100`, {
      headers: { authorization: `Bearer ${decryptSecret(acct.token_ciphertext)}` },
    });
    const body = (await res.json()) as { data?: { name: string; language: string; components?: { type: string; text?: string }[] }[] };
    const data = (body.data ?? []).map((t) => {
      const text = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
      return { name: t.name, language: t.language, body: text, params: (text.match(/\{\{\d+\}\}/g) ?? []).length };
    });
    return json({ data, connected: true });
  } catch {
    return json({ data: [], connected: true, error: 'Could not load templates from WhatsApp' });
  }
});
