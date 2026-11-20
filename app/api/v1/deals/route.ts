import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, decodeCursor, encodeCursor, json, readJson, readQuery, userRoute } from '@/server/http';
import { cleanCustom, dealOut, dealSelect, visibleContact, type DealRow } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';
import { reloadDeal } from '@/server/core/deals';
import { loadWorkspace } from '@/server/core/workspaces';
import { enqueue } from '@/server/queue';

const listSchema = z.object({
  pipeline_id: z.uuid().optional(),
  stage_id: z.uuid().optional(),
  contact_id: z.uuid().optional(),
  owner: z.union([z.literal('me'), z.uuid()]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

// GET /deals: most recently updated first, with the contact and next follow-up.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId, isManager }) => {
  const q = readQuery(req, listSchema);
  const cur = decodeCursor<{ u: string; id: string }>(q.cursor);
  const owner = !isManager || q.owner === 'me' ? userId : q.owner;
  const where = tx`
    d.workspace_id = ${workspace.id} and d.deleted_at is null
    ${owner ? tx`and d.owner_id = ${owner}` : tx``}
    ${q.pipeline_id ? tx`and d.pipeline_id = ${q.pipeline_id}` : tx``}
    ${q.stage_id ? tx`and d.stage_id = ${q.stage_id}` : tx``}
    ${q.contact_id ? tx`and d.contact_id = ${q.contact_id}` : tx``}`;
  const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from public.deals d where ${where}`;
  const rows = await tx<DealRow[]>`
    ${dealSelect(tx)}
    where ${where} ${cur ? tx`and (d.updated_at, d.id) < (${cur.u}::timestamptz, ${cur.id}::uuid)` : tx``}
    order by d.updated_at desc, d.id desc limit ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return json({
    data: page.map(dealOut),
    pagination: { limit: q.limit, next_cursor: rows.length > q.limit && last ? encodeCursor({ u: last.updated_at.toISOString(), id: last.id }) : null, total_visible: total },
  });
});

const createSchema = z.object({
  contact_id: z.uuid(),
  pipeline_id: z.uuid(),
  stage_id: z.uuid().optional(),
  title: z.string().trim().min(1, 'Deal title is required').max(200),
  value_minor: z.number().int().min(0).max(1e15).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  owner_id: z.uuid().optional(),
  expected_close: z.iso.date().nullable().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// POST /deals
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, createSchema);
  const contact = await visibleContact(tx, workspace.id, b.contact_id, userId, isManager);
  const ws = await loadWorkspace(tx, workspace.id);
  const custom = await cleanCustom(tx, workspace.id, 'deal', b.custom);
  const [stage] = await tx<{ id: string; name: string; kind: string }[]>`
    select s.id, s.name, s.kind from public.stages s join public.pipelines p on p.id = s.pipeline_id
     where p.id = ${b.pipeline_id} and p.workspace_id = ${workspace.id} ${b.stage_id ? tx`and s.id = ${b.stage_id}` : tx``}
     order by s.position limit 1`;
  if (!stage) throw new ApiError(422, 'invalid_stage', 'Choose a stage in this pipeline');
  const owner = isManager ? b.owner_id ?? contact.owner_id ?? userId : userId;
  await elevate(tx);
  const [d] = await tx<{ id: string }[]>`
    insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value_minor, currency, owner_id, expected_close, custom)
    values (${workspace.id}, ${b.pipeline_id}, ${stage.id}, ${contact.id}, ${b.title}, ${b.value_minor ?? 0},
            ${b.currency ?? ws.currency}, ${owner}, ${b.expected_close ?? null}, ${tx.json(custom as never)})
    returning id`;
  await logActivity(tx, { workspaceId: workspace.id, contactId: contact.id, dealId: d.id, type: 'system', actorId: userId, body: `Deal created: ${b.title}`, meta: { kind: 'deal_created', stage_id: stage.id } });
  await enqueue(tx, 'deal.stage_changed', { deal_id: d.id, workspace_id: workspace.id, from_stage_id: null, to_stage_id: stage.id, actor_id: userId },
    { workspaceId: workspace.id, dedupeKey: `deal.stage_changed:${d.id}:created` });
  return json({ deal: dealOut(await reloadDeal(tx, d.id)) }, 201);
});
