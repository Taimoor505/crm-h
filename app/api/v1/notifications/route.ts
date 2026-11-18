import { z } from 'zod';
import { decodeCursor, encodeCursor, json, limitSchema, readQuery, userRoute } from '@/server/http';

const schema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
});

// GET /notifications: the caller's notifications in this workspace, newest first.
export const GET = userRoute({}, async ({ req, tx, workspace, userId }) => {
  const q = readQuery(req, schema);
  const cursor = decodeCursor<{ c: string; id: string }>(q.cursor);
  const where = tx`and`.join([
    tx`user_id = ${userId}`,
    tx`workspace_id = ${workspace.id}`,
    q.unread === 'true' && tx`read_at is null`,
    cursor && tx`(created_at, id) < (${cursor.c}::timestamptz, ${cursor.id}::uuid)`,
  ]);
  const rows = await tx<{ id: string; created_at: Date; created_at_text: string }[]>`
    select id, type, priority, title, body, data, read_at, created_at, created_at::text as created_at_text
      from public.notifications
     where ${where}
     order by created_at desc, id desc
     limit ${q.limit + 1}`;
  const [{ count }] = await tx<{ count: number }[]>`
    select count(*)::int as count from public.notifications
     where user_id = ${userId} and workspace_id = ${workspace.id} and read_at is null`;

  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return json({
    data: page.map(({ created_at_text: _t, ...n }) => n),
    unread_count: count,
    next_cursor: rows.length > q.limit && last ? encodeCursor({ c: last.created_at_text, id: last.id }) : null,
  });
});
