import { z } from 'zod';
import { ApiError, authRoute, json, readJson } from '@/server/http';
import { partnerOf } from '@/server/core/partner';

const TARGET = process.env.PARTNER_CNAME_TARGET ?? 'cname.vercel-dns.com';
const out = (d: { id: string; domain: string; verified: boolean; created_at: Date }) => ({
  ...d, dns: { type: 'CNAME', name: d.domain, value: TARGET },
});

// GET /partner/domains
export const GET = authRoute(async ({ req, tx, userId }) => {
  const id = await partnerOf(tx, userId, req);
  const rows = await tx<{ id: string; domain: string; verified: boolean; created_at: Date }[]>`
    select id, domain, verified, created_at from public.partner_domains where partner_id = ${id} order by created_at`;
  return json({ data: rows.map(out) });
});

// POST /partner/domains { domain }: verified later, once DNS points at us.
export const POST = authRoute(async ({ req, tx, userId }) => {
  const id = await partnerOf(tx, userId, req);
  const b = await readJson(req, z.object({ domain: z.string().trim().toLowerCase().max(253) }));
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(b.domain)) {
    throw new ApiError(422, 'invalid_domain', 'Enter a valid domain, for example crm.yourcompany.com');
  }
  const [taken] = await tx`select 1 from public.partner_domains where domain = ${b.domain}`;
  if (taken) throw new ApiError(409, 'domain_taken', 'This domain is already connected');
  const [d] = await tx<{ id: string; domain: string; verified: boolean; created_at: Date }[]>`
    insert into public.partner_domains (partner_id, domain) values (${id}, ${b.domain}) returning id, domain, verified, created_at`;
  return json({ partner_domain: out(d) }, 201);
});
