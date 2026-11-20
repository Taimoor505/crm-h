import { withService } from '@/server/db';
import { json } from '@/server/http';
import { logged } from '@/server/observability/request-log';

// GET /health: database reachable and migrations applied.
async function GET_handler() {
  try {
    const [r] = await withService((tx) => tx<{ ok: number; workspaces: number }[]>`
      select 1 as ok, (select count(*)::int from public.workspaces) as workspaces`);
    return json({ ok: r.ok === 1, version: 'v1', database: 'up', auth_configured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) });
  } catch {
    return json({ ok: false, version: 'v1', database: 'down' }, 503);
  }
}
export const dynamic = 'force-dynamic';

export const GET = logged(GET_handler);
