import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';

type P = { id: string };

// GET /pipelines/:id/reasons: the won and lost reasons people pick from.
export const GET = userRoute<P>({ allowWhenReadOnly: true }, async ({ params, tx, workspace }) => {
  const [p] = await tx<{ won_reasons: string[]; lost_reasons: string[] }[]>`
    select won_reasons, lost_reasons from public.pipelines where id = ${params.id} and workspace_id = ${workspace.id}`;
  if (!p) throw new ApiError(404, 'not_found', 'Pipeline not found');
  return json({ data: { won: p.won_reasons, lost: p.lost_reasons } });
});

const list = z.array(z.string().trim().max(80)).max(30).transform((xs) => Array.from(new Set(xs.filter(Boolean))));

// PUT /pipelines/:id/reasons (owner/manager)
export const PUT = userRoute<P>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  const b = await readJson(req, z.object({ won: list.default([]), lost: list.default([]) }));
  await elevate(tx);
  const [p] = await tx<{ won_reasons: string[]; lost_reasons: string[] }[]>`
    update public.pipelines set won_reasons = ${b.won}::text[], lost_reasons = ${b.lost}::text[]
     where id = ${params.id} and workspace_id = ${workspace.id} returning won_reasons, lost_reasons`;
  if (!p) throw new ApiError(404, 'not_found', 'Pipeline not found');
  return json({ data: { won: p.won_reasons, lost: p.lost_reasons } });
});
