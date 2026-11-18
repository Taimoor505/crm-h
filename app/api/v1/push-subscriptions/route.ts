import { z } from 'zod';
import { elevate } from '@/server/db';
import { json, readJson, userRoute } from '@/server/http';

const subscribeSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

/**
 * POST /push-subscriptions: register this browser for web push. Send the
 * object from `registration.pushManager.subscribe(...)` (its toJSON()).
 * The same endpoint re-registered (e.g. after a different user logs in on the
 * same device) moves to the caller.
 */
export const POST = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, userId }) => {
  const body = await readJson(req, subscribeSchema);
  // The endpoint may belong to another user's row (shared device); RLS would hide it.
  await elevate(tx);
  const [row] = await tx<{ id: string }[]>`
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (${userId}, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth}, ${req.headers.get('user-agent')})
    on conflict (endpoint) do update set
      user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, disabled_at = null
    returning id`;
  return json({ data: { id: row.id } }, 201);
});

const unsubscribeSchema = z.object({ endpoint: z.url().max(2000) });

// DELETE /push-subscriptions: forget this browser (on logout).
export const DELETE = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, userId }) => {
  const body = await readJson(req, unsubscribeSchema);
  const r = await tx`delete from public.push_subscriptions where endpoint = ${body.endpoint} and user_id = ${userId}`;
  return json({ data: { removed: r.count } });
});
