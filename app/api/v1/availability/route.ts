import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';

const schema = z.object({
  available: z.boolean(),
  /** Managers may set someone else's availability; defaults to the caller. */
  user_id: z.uuid().optional(),
});

// PUT /availability: "I'm off today". Unavailable agents are skipped by
// round-robin and by-source assignment, and by auto-reassign.
export const PUT = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, schema);
  const target = body.user_id ?? userId;
  // RLS lets agents write only their own row; managers anyone's.
  const [row] = await tx<{ user_id: string; available: boolean; updated_at: Date }[]>`
    insert into public.agent_availability (workspace_id, user_id, available, updated_by, updated_at)
    values (${workspace.id}, ${target}, ${body.available}, ${userId}, now())
    on conflict (workspace_id, user_id) do update
      set available = excluded.available, updated_by = excluded.updated_by, updated_at = now()
    returning user_id, available, updated_at`;
  return json({ data: row });
});
