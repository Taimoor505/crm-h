import type { Db } from '../db';

interface StageRow { id: string; workspace_id: string; pipeline_id: string; name: string; position: number; kind: string }

/** Pipelines with their stages in order (GET /pipelines shape). */
export async function pipelinesWithStages(tx: Db, workspaceId: string, id?: string) {
  const pipes = await tx<{ id: string; workspace_id: string; name: string; position: number; created_at: Date; won_reasons: string[]; lost_reasons: string[] }[]>`
    select id, workspace_id, name, position, created_at, won_reasons, lost_reasons from public.pipelines
     where workspace_id = ${workspaceId} ${id ? tx`and id = ${id}` : tx``} order by position, created_at`;
  const stages = await tx<StageRow[]>`
    select * from public.stages where workspace_id = ${workspaceId} order by position`;
  return pipes.map((p) => ({ ...p, created_at: p.created_at.toISOString(), stages: stages.filter((s) => s.pipeline_id === p.id) }));
}
