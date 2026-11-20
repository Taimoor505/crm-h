import { z } from 'zod';
import { decodeCursor, encodeCursor, json, readQuery, userRoute } from '@/server/http';
import { activityOut, visibleContact, type ActivityRow } from '@/server/core/crm';

// GET /contacts/:id/timeline: activities, newest first.
export const GET = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ req, params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  const q = readQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }));
  const cur = decodeCursor<{ c: string; id: string }>(q.cursor);
  const rows = await tx<ActivityRow[]>`
    select * from public.activities where contact_id = ${c.id} and workspace_id = ${workspace.id}
      ${cur ? tx`and (created_at, id) < (${cur.c}::timestamptz, ${cur.id}::uuid)` : tx``}
     order by created_at desc, id desc limit ${q.limit + 1}`;
  const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from public.activities where contact_id = ${c.id}`;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return json({
    data: page.map(activityOut),
    pagination: { limit: q.limit, next_cursor: rows.length > q.limit && last ? encodeCursor({ c: last.created_at.toISOString(), id: last.id }) : null, total },
  });
});
