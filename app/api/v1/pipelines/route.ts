import { z } from 'zod';
import { elevate } from '@/server/db';
import { json, readJson, userRoute } from '@/server/http';
import { pipelinesWithStages } from '@/server/core/pipelines';

// GET /pipelines: with stages in order.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ tx, workspace }) => {
  return json({ data: await pipelinesWithStages(tx, workspace.id) });
});

// POST /pipelines (owner/manager): a new pipeline with starter stages.
export const POST = userRoute({ managerOnly: true }, async ({ req, tx, workspace }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(1, 'Pipeline name is required').max(80) }));
  await elevate(tx);
  const [p] = await tx<{ id: string }[]>`
    insert into public.pipelines (workspace_id, name, position)
    values (${workspace.id}, ${b.name}, (select coalesce(max(position), 0) + 1 from public.pipelines where workspace_id = ${workspace.id}))
    returning id`;
  const starter = [['New', 'open'], ['In progress', 'open'], ['Won', 'won'], ['Lost', 'lost']] as const;
  for (const [i, [name, kind]] of starter.entries()) {
    await tx`insert into public.stages (workspace_id, pipeline_id, name, position, kind) values (${workspace.id}, ${p.id}, ${name}, ${i + 1}, ${kind})`;
  }
  const [pipeline] = await pipelinesWithStages(tx, workspace.id, p.id);
  return json({ pipeline }, 201);
});
