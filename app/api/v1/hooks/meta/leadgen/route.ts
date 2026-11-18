import { timingSafeEqual } from 'node:crypto';
import { withService } from '@/server/db';
import { errorResponse, json, ApiError } from '@/server/http';
import { verifyMetaSignature } from '@/server/channels/meta';
import { recordLeadgen, type LeadgenChange } from '@/server/leads/meta';

/**
 * Meta lead ads webhook (one URL for the whole platform; set it in the Meta
 * app's Webhooks settings, object "page", field "leadgen").
 *
 * GET: Meta's verification handshake (hub.verify_token = META_VERIFY_TOKEN).
 * POST: signed with the app secret (X-Hub-Signature-256). We only record the
 * lead id and queue a job, so Meta gets its 200 within milliseconds; the
 * worker fetches the answers from the Graph API.
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

interface WebhookBody {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: Partial<LeadgenChange> }[] }[];
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) {
      throw new ApiError(401, 'bad_signature', 'Invalid X-Hub-Signature-256');
    }
    let body: WebhookBody;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'bad_json', 'Body must be JSON');
    }

    const results: Record<string, number> = { queued: 0, duplicate: 0, no_source: 0 };
    await withService(async (tx) => {
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const v = change.value;
          if (change.field !== 'leadgen' || !v?.leadgen_id) continue;
          const pageId = String(v.page_id ?? entry.id ?? '');
          const r = await recordLeadgen(tx, {
            leadgen_id: String(v.leadgen_id),
            page_id: pageId,
            form_id: v.form_id ? String(v.form_id) : undefined,
            ad_id: v.ad_id ? String(v.ad_id) : undefined,
            created_time: v.created_time,
          });
          results[r]++;
          if (r === 'no_source') console.warn(`[meta] leadgen for page ${pageId} matches no active lead source`);
        }
      }
    });
    return json({ ok: true, ...results });
  } catch (err) {
    return errorResponse(err);
  }
}
