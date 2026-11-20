import { z } from 'zod';
import { json, readQuery } from '@/server/http';
import { adminRoute } from '@/server/billing/context';

const schema = z.object({
  status: z.enum(['all', '2xx', '3xx', '4xx', '5xx', 'errors']).default('all'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
  /** Text in the path, route, error code, user email/name or workspace name. */
  q: z.string().trim().max(200).optional(),
  workspace_id: z.uuid().optional(),
  user_id: z.uuid().optional(),
  slow: z.enum(['true', 'false']).optional(),
  minutes: z.coerce.number().int().min(1).max(20160).default(1440),
  /** Rows older than this id (pagination). */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// GET /dev/logs (super-admins): recent API calls, newest first, plus a summary.
export const GET = adminRoute(async ({ req, tx }) => {
  const q = readQuery(req, schema);
  const statusCond = {
    all: null,
    '2xx': tx`l.status between 200 and 299`,
    '3xx': tx`l.status between 300 and 399`,
    '4xx': tx`l.status between 400 and 499`,
    '5xx': tx`l.status >= 500`,
    errors: tx`l.status >= 400`,
  }[q.status];
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const where = tx`and`.join([
    tx`l.at > now() - make_interval(mins => ${q.minutes})`,
    statusCond,
    q.method && tx`l.method = ${q.method}`,
    q.workspace_id && tx`l.workspace_id = ${q.workspace_id}`,
    q.user_id && tx`l.user_id = ${q.user_id}`,
    q.slow === 'true' && tx`l.duration_ms >= 1000`,
    like && tx`(l.path ilike ${like} or l.error_code ilike ${like} or u.email ilike ${like} or u.name ilike ${like} or w.name ilike ${like} or l.request_id = ${q.q!})`,
    q.before && tx`l.id < ${q.before}`,
  ].filter(Boolean) as never[]);

  const rows = await tx`
    select l.id, l.at, l.request_id, l.method, l.route, l.path, l.status, l.duration_ms, l.error_code,
           l.ip, l.user_agent, l.region, l.user_id, u.name as user_name, u.email as user_email,
           l.workspace_id, w.name as workspace_name
      from public.api_request_logs l
      left join public.users u on u.id = l.user_id
      left join public.workspaces w on w.id = l.workspace_id
     where ${where}
     order by l.id desc
     limit ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);

  const [summary] = await tx`
    select count(*)::int as requests,
           count(*) filter (where status >= 500)::int as server_errors,
           count(*) filter (where status between 400 and 499)::int as client_errors,
           (percentile_cont(0.5) within group (order by duration_ms))::int as p50_ms,
           (percentile_cont(0.95) within group (order by duration_ms))::int as p95_ms,
           count(distinct user_id)::int as users
      from public.api_request_logs where at > now() - interval '1 hour'`;
  const routes = await tx`
    select method, route, count(*)::int as requests,
           count(*) filter (where status >= 400)::int as errors,
           (percentile_cont(0.95) within group (order by duration_ms))::int as p95_ms
      from public.api_request_logs where at > now() - interval '24 hours'
     group by method, route order by p95_ms desc nulls last limit 8`;

  return json({
    data: page,
    next_before: rows.length > q.limit ? page[page.length - 1].id : null,
    summary: { ...summary, slowest_routes: routes },
  });
});
