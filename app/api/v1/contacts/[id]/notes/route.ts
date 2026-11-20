import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';
import { activityOut, visibleContact, type ActivityRow } from '@/server/core/crm';

// POST /contacts/:id/notes
export const POST = userRoute<{ id: string }>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, z.object({ body: z.string().trim().min(1, 'Note is empty').max(5000), deal_id: z.uuid().optional() }));
  const [a] = await tx<ActivityRow[]>`
    insert into public.activities (workspace_id, contact_id, deal_id, type, actor_id, body)
    values (${workspace.id}, ${c.id}, ${b.deal_id ?? null}, 'note', ${userId}, ${b.body}) returning *`;
  await tx`update public.contacts set last_activity_at = now() where id = ${c.id}`;
  return json({ activity: activityOut(a) }, 201);
});
