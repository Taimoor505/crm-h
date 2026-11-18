import { z } from 'zod';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { defaultRules, type AssignmentRules } from '@/server/assignment/engine';
import { jsonb, type Db } from '@/server/db';

async function present(tx: Db, workspaceId: string, rules: AssignmentRules) {
  const agents = await tx<{ user_id: string; name: string | null; role: string; available: boolean }[]>`
    select m.user_id, u.name, m.role, coalesce(a.available, true) as available
      from public.memberships m
      join public.users u on u.id = m.user_id
      left join public.agent_availability a on a.workspace_id = m.workspace_id and a.user_id = m.user_id
     where m.workspace_id = ${workspaceId} and m.status = 'active'
     order by u.name nulls last`;
  const { rr_state: _rr, ...rest } = rules;
  void _rr;
  return { ...rest, members: agents };
}

// GET /assignment-rules: current rules plus every member's availability.
export const GET = userRoute({}, async ({ tx, workspace }) => {
  const [row] = await tx<AssignmentRules[]>`
    select * from public.assignment_rules where workspace_id = ${workspace.id}`;
  return json({ data: await present(tx, workspace.id, row ?? defaultRules(workspace.id)) });
});

const putSchema = z
  .object({
    mode: z.enum(['manual', 'round_robin', 'by_source']),
    agent_ids: z.array(z.uuid()).max(200).default([]),
    source_map: z.record(z.string().min(1).max(64), z.array(z.uuid()).min(1).max(50)).default({}),
    fallback: z.enum(['round_robin', 'unassigned']).default('round_robin'),
    reassign_after_minutes: z.number().int().min(5).max(1440).nullable().default(null),
    max_auto_reassigns: z.number().int().min(1).max(10).default(2),
  })
  .superRefine((r, ctx) => {
    if (r.mode === 'round_robin' && r.agent_ids.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['agent_ids'], message: 'Round-robin needs at least one agent' });
    }
    if (r.mode === 'by_source' && Object.keys(r.source_map).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['source_map'], message: 'By source needs at least one source mapping' });
    }
  });

// PUT /assignment-rules (managers): replaces the rules; rotation position is kept.
export const PUT = userRoute({ managerOnly: true }, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, putSchema);
  const agentIds = [...new Set(body.agent_ids)];
  const referenced = [...new Set([...agentIds, ...Object.values(body.source_map).flat()])];
  if (referenced.length) {
    const members = await tx<{ user_id: string }[]>`
      select user_id from public.memberships
       where workspace_id = ${workspace.id} and status = 'active' and user_id = any(${referenced}::uuid[])`;
    const ok = new Set(members.map((m) => m.user_id));
    const bad = referenced.filter((id) => !ok.has(id));
    if (bad.length) throw new ApiError(422, 'invalid_members', 'Not active members of this workspace', { user_ids: bad });
  }

  const [row] = await tx<AssignmentRules[]>`
    insert into public.assignment_rules
      (workspace_id, mode, agent_ids, source_map, fallback, reassign_after_minutes, max_auto_reassigns,
       updated_by, updated_at)
    values (${workspace.id}, ${body.mode}, ${agentIds}::uuid[], ${jsonb(tx, body.source_map)}::jsonb,
            ${body.fallback}, ${body.reassign_after_minutes}::int, ${body.max_auto_reassigns}, ${userId}, now())
    on conflict (workspace_id) do update set
      mode = excluded.mode, agent_ids = excluded.agent_ids, source_map = excluded.source_map,
      fallback = excluded.fallback, reassign_after_minutes = excluded.reassign_after_minutes,
      max_auto_reassigns = excluded.max_auto_reassigns, updated_by = excluded.updated_by,
      updated_at = now()
    returning *`;
  return json({ data: await present(tx, workspace.id, row) });
});
