import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readQuery, userRoute } from '@/server/http';

// DELETE /pipelines/:id/stages/:stageId?move_to=<stage>: deals in it move to move_to first.
export const DELETE = userRoute<{ id: string; stageId: string }>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  const q = readQuery(req, z.object({ move_to: z.uuid().optional() }));
  await elevate(tx);
  const [s] = await tx<{ id: string; position: number }[]>`
    select id, position from public.stages where id = ${params.stageId} and pipeline_id = ${params.id} and workspace_id = ${workspace.id}`;
  if (!s) throw new ApiError(404, 'not_found', 'Stage not found');
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.stages where pipeline_id = ${params.id}`;
  if (n <= 2) throw new ApiError(409, 'last_stages', 'A pipeline needs at least two stages');
  const [{ deals }] = await tx<{ deals: number }[]>`select count(*)::int as deals from public.deals where stage_id = ${s.id}`;
  let moved = 0;
  if (deals > 0) {
    if (!q.move_to || q.move_to === s.id) throw new ApiError(422, 'move_to_required', 'Choose a stage to move the deals to');
    const [target] = await tx`select id from public.stages where id = ${q.move_to} and pipeline_id = ${params.id}`;
    if (!target) throw new ApiError(422, 'move_to_required', 'Choose a stage in the same pipeline');
    moved = (await tx`update public.deals set stage_id = ${q.move_to}, stage_entered_at = now(), updated_at = now() where stage_id = ${s.id}`).count;
  }
  await tx`delete from public.stages where id = ${s.id}`;
  await tx`update public.stages set position = position - 1 where pipeline_id = ${params.id} and position > ${s.position}`;
  return json({ data: { moved_deals: moved } });
});
