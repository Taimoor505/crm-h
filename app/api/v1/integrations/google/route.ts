import { authRoute, json } from '@/server/http';
import { disconnect, googleConfigured } from '@/server/integrations/google';

// GET /integrations/google: is Google set up on the server, and is this user connected?
export const GET = authRoute(async ({ tx, userId }) => {
  const [c] = await tx<{ google_email: string | null; connected_at: Date; last_synced_at: Date | null; last_error: string | null }[]>`
    select google_email, connected_at, last_synced_at, last_error
      from public.google_calendar_connections where user_id = ${userId}`;
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.task_calendar_events where user_id = ${userId}`;
  return json({
    data: {
      configured: googleConfigured(),
      connected: Boolean(c),
      email: c?.google_email ?? null,
      connected_at: c?.connected_at ?? null,
      last_synced_at: c?.last_synced_at ?? null,
      last_error: c?.last_error ?? null,
      synced_count: n,
    },
  });
});

// DELETE /integrations/google: revoke access and forget the link (events stay in Google).
export const DELETE = authRoute(async ({ tx, userId }) => {
  await disconnect(tx, userId);
  return json({ data: { connected: false } });
});
