import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';
import { enqueue } from '@/server/queue';
import { activityOut, markResponded, visibleContact, type ActivityRow } from '@/server/core/crm';

const OUTCOME_TEXT: Record<string, string> = { answered: 'answered', no_answer: 'no answer', busy: 'busy', wrong_number: 'wrong number', voicemail: 'voicemail' };

// POST /contacts/:id/calls: log a call and its outcome.
export const POST = userRoute<{ id: string }>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, z.object({
    outcome: z.enum(['answered', 'no_answer', 'busy', 'wrong_number', 'voicemail']),
    note: z.string().trim().max(2000).optional(),
    duration_sec: z.number().int().min(0).max(36000).optional(),
    deal_id: z.uuid().optional(),
  }));
  await markResponded(tx, c.id);
  if (b.outcome === 'wrong_number') await tx`update public.contacts set status = 'cold' where id = ${c.id}`;
  else if (c.status === 'new') await tx`update public.contacts set status = 'contacted' where id = ${c.id}`;
  const [a] = await tx<ActivityRow[]>`
    insert into public.activities (workspace_id, contact_id, deal_id, type, actor_id, body, meta)
    values (${workspace.id}, ${c.id}, ${b.deal_id ?? null}, 'call', ${userId},
            ${`Call: ${OUTCOME_TEXT[b.outcome]}${b.note ? ` · ${b.note}` : ''}`},
            ${tx.json({ outcome: b.outcome, duration_sec: b.duration_sec ?? null })}) returning *`;
  await enqueue(tx, 'call.logged', { contact_id: c.id, workspace_id: workspace.id, outcome: b.outcome, actor_id: userId, activity_id: a.id },
    { workspaceId: workspace.id, dedupeKey: `call.logged:${a.id}` });
  return json({ activity: activityOut(a) }, 201);
});
