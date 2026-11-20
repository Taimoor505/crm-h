import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { dealOut } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';
import { reloadDeal, visibleDeal } from '@/server/core/deals';
import { enqueue } from '@/server/queue';

// POST /deals/:id/move: { stage_id, lost_reason (required for lost stages), won_reason }
export const POST = userRoute<{ id: string }>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const d = await visibleDeal(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, z.object({
    stage_id: z.uuid(),
    lost_reason: z.string().trim().max(200).optional(),
    won_reason: z.string().trim().max(200).optional(),
  }));
  const [stage] = await tx<{ id: string; name: string; kind: string }[]>`
    select id, name, kind from public.stages where id = ${b.stage_id} and pipeline_id = ${d.pipeline_id}`;
  if (!stage) throw new ApiError(422, 'invalid_stage', 'Stage not found in this pipeline');
  if (stage.kind === 'lost' && !b.lost_reason) throw new ApiError(422, 'lost_reason_required', 'Pick a reason the deal was lost');
  if (stage.id === d.stage_id) return json({ deal: dealOut(d) });
  await elevate(tx);
  await tx`
    update public.deals set stage_id = ${stage.id}, stage_entered_at = now(), updated_at = now(),
           lost_reason = ${stage.kind === 'lost' ? b.lost_reason ?? null : null},
           won_reason = ${stage.kind === 'won' ? b.won_reason ?? null : null}
     where id = ${d.id}`;
  if (stage.kind !== 'open') {
    await tx`update public.contacts set status = ${stage.kind}, updated_at = now() where id = ${d.contact_id}`;
  }
  const reason = stage.kind === 'lost' ? b.lost_reason : stage.kind === 'won' ? b.won_reason : null;
  await logActivity(tx, {
    workspaceId: workspace.id, contactId: d.contact_id, dealId: d.id, type: 'stage_change', actorId: userId,
    body: `Moved to ${stage.name}${reason ? ` · ${reason}` : ''}`,
    meta: { from_stage_id: d.stage_id, to_stage_id: stage.id, kind: stage.kind, reason: reason ?? null },
  });
  const key = `${d.id}:${stage.id}:${Date.now()}`;
  await enqueue(tx, 'deal.stage_changed', { deal_id: d.id, workspace_id: workspace.id, from_stage_id: d.stage_id, to_stage_id: stage.id, actor_id: userId },
    { workspaceId: workspace.id, dedupeKey: `deal.stage_changed:${key}` });
  if (stage.kind === 'won') {
    await enqueue(tx, 'deal.won', { deal_id: d.id, workspace_id: workspace.id, actor_id: userId }, { workspaceId: workspace.id, dedupeKey: `deal.won:${key}` });
  }
  return json({ deal: dealOut(await reloadDeal(tx, d.id)) });
});
