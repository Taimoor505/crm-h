import { timingSafeEqual } from 'node:crypto';
import { withService } from '@/server/db';
import { errorResponse, json, ApiError } from '@/server/http';
import { verifyMetaSignature } from '@/server/channels/meta';
import { recordInbound, recordStatus } from '@/server/core/inbox';

/**
 * WhatsApp Cloud API webhook (Meta app → Webhooks → whatsapp_business_account,
 * field "messages"). GET is the verification handshake (META_VERIFY_TOKEN);
 * POST is signed with the app secret.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = process.env.META_VERIFY_TOKEN ?? '';
  const got = q.get('hub.verify_token') ?? '';
  const ok = q.get('hub.mode') === 'subscribe' && expected.length > 0 && got.length === expected.length
    && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return new Response('Forbidden', { status: 403 });
  return new Response(q.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
}

interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { id: string; from: string; timestamp?: string; type: string; text?: { body?: string }; button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; image?: { caption?: string }; document?: { caption?: string } }[];
  statuses?: { id: string; status: string }[];
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) {
      throw new ApiError(401, 'bad_signature', 'Invalid X-Hub-Signature-256');
    }
    let body: { entry?: { changes?: { field?: string; value?: WaValue }[] }[] };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'bad_json', 'Body must be JSON');
    }
    const results: string[] = [];
    await withService(async (tx) => {
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const v = change.value;
          if (change.field !== 'messages' || !v) continue;
          const phoneNumberId = v.metadata?.phone_number_id ?? '';
          for (const m of v.messages ?? []) {
            const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
            const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
              ?? m.image?.caption ?? m.document?.caption ?? '';
            const r = await recordInbound(tx, {
              phoneNumberId, from: m.from, profileName: name, waMessageId: m.id, type: m.type, text,
              timestamp: m.timestamp ? Number(m.timestamp) : null,
            });
            results.push(r.status);
          }
          for (const s of v.statuses ?? []) await recordStatus(tx, s.id, s.status);
        }
      }
    });
    return json({ received: true, results });
  } catch (err) {
    return errorResponse(err);
  }
}
