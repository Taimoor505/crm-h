import { z } from 'zod';
import { authRoute, json, readJson } from '@/server/http';
import { partnerOf } from '@/server/core/partner';
import { cleanBranding, mergeBranding } from '@/server/core/workspaces';

// GET /partner/branding: the partner's default branding for all its workspaces.
export const GET = authRoute(async ({ req, tx, userId }) => {
  const id = await partnerOf(tx, userId, req);
  const [p] = await tx<{ default_branding: Record<string, unknown> }[]>`select default_branding from public.partners where id = ${id}`;
  return json({ data: p?.default_branding ?? {} });
});

// PATCH /partner/branding { branding }: null on a key removes it.
export const PATCH = authRoute(async ({ req, tx, userId }) => {
  const id = await partnerOf(tx, userId, req);
  const b = await readJson(req, z.object({ branding: z.record(z.string(), z.unknown()) }));
  const [p] = await tx<{ default_branding: Record<string, unknown> }[]>`select default_branding from public.partners where id = ${id} for update`;
  const next = mergeBranding(p.default_branding ?? {}, cleanBranding(b.branding));
  const [partner] = await tx`update public.partners set default_branding = ${tx.json(next as never)} where id = ${id}
                              returning id, name, slug, is_house, default_branding as branding`;
  return json({ partner, data: partner.branding });
});
