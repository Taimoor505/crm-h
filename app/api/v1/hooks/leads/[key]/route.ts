import { ApiError, errorResponse, json } from '@/server/http';
import { jsonb, withService } from '@/server/db';
import { rateLimit } from '@/server/ratelimit';
import { applyMapping } from '@/server/leads/mapping';
import { ingestLead } from '@/server/leads/ingest';
import { verifyWebhook, type LeadSource } from '@/server/leads/sources';

/**
 * POST /hooks/leads/:key, public.
 *  - website_form sources: called from the browser (embed script or a plain
 *    HTML form). Checked by Origin allow-list, honeypot and rate limit.
 *  - webhook sources: called server-to-server (Zapier, Make, n8n, partner
 *    sites). Must carry X-Signature (HMAC) or X-Webhook-Secret.
 * The raw payload is stored in lead_events (30 days) whatever the outcome.
 */

const HONEYPOT_FIELDS = ['_hp', '_honeypot', 'website_url_confirm'];
const KEPT_HEADERS = ['content-type', 'user-agent', 'origin', 'referer'];

async function loadSource(key: string): Promise<LeadSource | null> {
  return withService(async (tx) => {
    const [s] = await tx<LeadSource[]>`
      select s.* from public.lead_sources s
        join public.workspaces w on w.id = s.workspace_id
       where s.public_key = ${key} and s.is_active and w.status = 'active'
         and s.type in ('website_form', 'webhook')`;
    return s ?? null;
  });
}

function corsHeaders(source: LeadSource | null, origin: string | null): Record<string, string> {
  if (!source || source.type !== 'website_form' || !origin || !originAllowed(source, origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function originAllowed(source: LeadSource, origin: string): boolean {
  const allowed = source.settings.allowed_origins ?? [];
  return allowed.length === 0 || allowed.includes(origin);
}

/**
 * Visitor IP for rate limiting. Hosting proxies (Vercel, Cloud Run, nginx)
 * set x-real-ip, or append the real client as the LAST x-forwarded-for entry;
 * the first entry is whatever the client sent, so it can't be trusted.
 */
function clientIp(req: Request): string | null {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const chain = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - 1] ?? null;
}

function parseBody(raw: string, contentType: string): Record<string, unknown> {
  if (!raw) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  throw new ApiError(400, 'bad_body', 'Body must be a JSON object or form-encoded');
}

export async function OPTIONS(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const source = await loadSource(key);
  return new Response(null, { status: 204, headers: corsHeaders(source, req.headers.get('origin')) });
}

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const origin = req.headers.get('origin');
  let cors: Record<string, string> = {};
  try {
    const { key } = await ctx.params;
    const source = await loadSource(key);
    if (!source) throw new ApiError(404, 'not_found', 'Unknown or inactive lead source');
    cors = corsHeaders(source, origin);

    const raw = await req.text();
    if (raw.length > 64 * 1024) throw new ApiError(413, 'too_large', 'Payload over 64 KB');

    if (source.type === 'webhook') {
      if (!source.secret || !verifyWebhook(source.secret, raw, req.headers)) {
        throw new ApiError(401, 'bad_signature', 'Missing or invalid X-Signature / X-Webhook-Secret');
      }
    } else if (origin && !originAllowed(source, origin)) {
      throw new ApiError(403, 'origin_not_allowed', 'This website is not allowed to post to this form');
    }

    const contentType = req.headers.get('content-type') ?? '';
    const payload = parseBody(raw, contentType);
    const ip = clientIp(req);
    const headers = Object.fromEntries(KEPT_HEADERS.map((h) => [h, req.headers.get(h)]).filter(([, v]) => v));
    const wantsRedirect = source.type === 'website_form' && contentType.includes('form-urlencoded')
      && !!source.settings.redirect_url;

    const result = await withService(async (tx) => {
      await rateLimit(tx, `lead_source:${source.id}`, source.type === 'webhook' ? 300 : 60);
      if (source.type === 'website_form' && ip) await rateLimit(tx, `lead_ip:${source.id}:${ip}`, 10);

      const [event] = await tx<{ id: string }[]>`
        insert into public.lead_events (workspace_id, lead_source_id, payload, headers, ip)
        values (${source.workspace_id}, ${source.id}, ${jsonb(tx, payload)}::jsonb,
                ${jsonb(tx, headers)}::jsonb, ${ip})
        returning id`;

      // Bots fill hidden fields. Answer 200 so they learn nothing, but don't create a lead.
      if (HONEYPOT_FIELDS.some((f) => typeof payload[f] === 'string' && payload[f] !== '')) {
        await tx`update public.lead_events set status = 'rejected', error = 'honeypot' where id = ${event.id}`;
        return { status: 'accepted' as const, contact_id: null };
      }

      try {
        const ingested = await tx.savepoint((sp) =>
          ingestLead(sp, {
            workspaceId: source.workspace_id,
            source: {
              id: source.id,
              name: source.name,
              source_label: source.source_label,
              default_tags: source.settings.default_tags,
            },
            lead: applyMapping(payload, source.mapping),
            leadEventId: event.id,
          }),
        );
        await tx`update public.lead_events set status = ${ingested.status}, contact_id = ${ingested.contact.id}
                 where id = ${event.id}`;
        return { status: ingested.status, contact_id: ingested.contact.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await tx`update public.lead_events
                    set status = ${err instanceof ApiError ? 'rejected' : 'failed'}, error = ${msg}
                  where id = ${event.id}`;
        if (err instanceof ApiError) return { error: err };
        throw err;
      }
    });

    if ('error' in result && result.error) throw result.error;
    if (wantsRedirect) {
      return new Response(null, { status: 303, headers: { ...cors, location: source.settings.redirect_url! } });
    }
    return json({ ok: true, ...result }, 201, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
}

