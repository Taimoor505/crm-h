import { z } from 'zod';
import { withService } from '@/server/db';
import { errorResponse, json, readQuery } from '@/server/http';
import { housePartner } from '@/server/core/workspaces';
import { logged } from '@/server/observability/request-log';

const q = z.object({ workspace_id: z.uuid().optional(), host: z.string().max(253).optional() });

/**
 * GET /branding (public): partner defaults merged with the workspace's own
 * overrides. Used before sign-in (by host) and after (by workspace).
 */
async function GET_handler(req: Request) {
  try {
    const p = readQuery(req, q);
    const out = await withService(async (tx) => {
      const [ws] = p.workspace_id
        ? await tx<{ id: string; name: string; template_key: string; partner_id: string; branding: Record<string, unknown> }[]>`
            select id, name, template_key, partner_id, branding from public.workspaces where id = ${p.workspace_id}`
        : [];
      const host = p.host?.toLowerCase().replace(/:\d+$/, '') ?? null;
      const [domain] = host
        ? await tx<{ domain: string; partner_id: string }[]>`
            select domain, partner_id from public.partner_domains where domain = ${host} and verified`
        : [];
      const partnerId = ws?.partner_id ?? domain?.partner_id ?? null;
      const [partner] = partnerId
        ? await tx<{ id: string; name: string; slug: string; is_house: boolean; default_branding: Record<string, unknown> }[]>`
            select id, name, slug, is_house, default_branding from public.partners where id = ${partnerId}`
        : [await housePartner(tx)];
      return {
        partner: { id: partner.id, name: partner.name, slug: partner.slug, is_house: partner.is_house },
        workspace: ws ? { id: ws.id, name: ws.name, template_key: ws.template_key, locale: 'en' } : null,
        matched_domain: domain?.domain ?? null,
        branding: { ...(partner.default_branding ?? {}), ...(ws?.branding ?? {}) },
      };
    });
    return json(out, 200, { 'cache-control': 'private, max-age=60' });
  } catch (err) {
    return errorResponse(err);
  }
}
export const dynamic = 'force-dynamic';

export const GET = logged(GET_handler);
