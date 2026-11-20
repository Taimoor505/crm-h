import { z } from 'zod';
import { elevate, type Db } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';

type P = { id: string };
async function ownPipeline(tx: Db, workspaceId: string, id: string) {
  const [p] = await tx`select id from public.pipelines where id = ${id} and workspace_id = ${workspaceId}`;
  if (!p) throw new ApiError(404, 'not_found', 'Pipeline not found');
}

// POST /pipelines/:id/stages: new stage, before the first won/lost stage unless a position is given.
export const POST = userRoute<P>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  const b = await readJson(req, z.object({
    name: z.string().trim().min(1, 'Stage name is required').max(60),
    kind: z.enum(['open', 'won', 'lost']).default('open'),
    position: z.number().int().min(1).optional(),
  }));
  await ownPipeline(tx, workspace.id, params.id);
  await elevate(tx);
  const [{ pos }] = await tx<{ pos: number }[]>`
    select coalesce(${b.position ?? null}::int,
                    (select min(position) from public.stages where pipeline_id = ${params.id} and kind <> 'open'),
                    (select coalesce(max(position), 0) + 1 from public.stages where pipeline_id = ${params.id})) as pos`;
  await tx`update public.stages set position = position + 1 where pipeline_id = ${params.id} and position >= ${pos}`;
  const [stage] = await tx`
    insert into public.stages (workspace_id, pipeline_id, name, position, kind)
    values (${workspace.id}, ${params.id}, ${b.name}, ${pos}, ${b.kind}) returning *`;
  return json({ stage }, 201);
});

// PATCH /pipelines/:id/stages: { stage_id, name?, kind?, position? } or { order: [stage ids] }.
export const PATCH = userRoute<P>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  const b = await readJson(req, z.object({
    stage_id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60).optional(),
    kind: z.enum(['open', 'won', 'lost']).optional(),
    position: z.number().int().min(1).optional(),
    order: z.array(z.uuid()).optional(),
  }));
  await ownPipeline(tx, workspace.id, params.id);
  await elevate(tx);
  if (b.order) {
    for (const [i, id] of b.order.entries()) {
      await tx`update public.stages set position = ${i + 1} where id = ${id} and pipeline_id = ${params.id}`;
    }
    const stages = await tx`select * from public.stages where pipeline_id = ${params.id} order by position`;
    return json({ stages });
  }
  if (!b.stage_id) throw new ApiError(422, 'validation_failed', 'stage_id is required');
  const [s] = await tx<{ id: string; name: string; kind: string; position: number }[]>`
    select * from public.stages where id = ${b.stage_id} and pipeline_id = ${params.id}`;
  if (!s) throw new ApiError(404, 'not_found', 'Stage not found');
  if (b.position && b.position !== s.position) {
    // Move within the list, shifting the stages in between.
    if (b.position > s.position) {
      await tx`update public.stages set position = position - 1 where pipeline_id = ${params.id} and position > ${s.position} and position <= ${b.position}`;
    } else {
      await tx`update public.stages set position = position + 1 where pipeline_id = ${params.id} and position >= ${b.position} and position < ${s.position}`;
    }
  }
  const [stage] = await tx`
    update public.stages set name = ${b.name ?? s.name}, kind = ${b.kind ?? s.kind}, position = ${b.position ?? s.position}
     where id = ${s.id} returning *`;
  return json({ stage });
});
