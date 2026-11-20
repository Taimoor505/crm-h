import { withService } from '../db';
import { env } from '../env';
import { supabaseHeaders } from '../identity/gotrue';

/**
 * Live health for the public status page. Each check is timed; results are
 * cached for 15 s and stored (at most once a minute) for the uptime history.
 * Nothing here returns error messages, hostnames or keys.
 */
export type State = 'up' | 'degraded' | 'down';
export interface Check {
  key: 'api' | 'database' | 'auth' | 'storage' | 'jobs';
  state: State;
  latency_ms: number | null;
}

const SLOW_MS = 1500;
const TIMEOUT_MS = 5000;

async function timed(fn: () => Promise<boolean>): Promise<{ ok: boolean; ms: number }> {
  const t = performance.now();
  try {
    const ok = await Promise.race([fn(), new Promise<boolean>((r) => setTimeout(() => r(false), TIMEOUT_MS))]);
    return { ok, ms: Math.round(performance.now() - t) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t) };
  }
}

const stateOf = (ok: boolean, ms: number): State => (!ok ? 'down' : ms > SLOW_MS ? 'degraded' : 'up');

async function probeHttp(path: string, okStatus: (s: number) => boolean): Promise<boolean> {
  const base = env.supabaseUrl.replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const res = await fetch(`${base}${path}`, { headers: supabaseHeaders(key), cache: 'no-store' });
  return okStatus(res.status);
}

export async function runChecks(): Promise<Check[]> {
  const configured = Boolean(env.supabaseUrl);
  const [db, auth, storage, apiStats, jobs] = await Promise.all([
    timed(() => withService(async (tx) => (await tx`select 1 as ok`).length === 1)),
    configured ? timed(() => probeHttp('/auth/v1/health', (s) => s === 200)) : null,
    // Any answer below 500 means the storage service is reachable.
    configured ? timed(() => probeHttp('/storage/v1/object/public/branding/.status-probe', (s) => s < 500)) : null,
    withService((tx) => tx<{ total: number; errors: number }[]>`
      select count(*)::int as total, count(*) filter (where status >= 500)::int as errors
        from public.api_request_logs where at > now() - interval '15 minutes'`).catch(() => [{ total: 0, errors: 0 }]),
    withService((tx) => tx<{ late: number }[]>`
      select count(*)::int as late from public.jobs
       where status = 'queued' and run_at < now() - interval '15 minutes'`).catch(() => [{ late: -1 }]),
  ]);
  const { total, errors } = apiStats[0];
  const errRate = total ? errors / total : 0;
  const checks: Check[] = [
    { key: 'api', state: errRate > 0.25 ? 'down' : errRate > 0.05 ? 'degraded' : 'up', latency_ms: null },
    { key: 'database', state: stateOf(db.ok, db.ms), latency_ms: db.ms },
  ];
  if (auth) checks.push({ key: 'auth', state: stateOf(auth.ok, auth.ms), latency_ms: auth.ms });
  if (storage) checks.push({ key: 'storage', state: stateOf(storage.ok, storage.ms), latency_ms: storage.ms });
  const late = jobs[0].late;
  checks.push({ key: 'jobs', state: late < 0 ? 'down' : late > 0 ? 'degraded' : 'up', latency_ms: null });
  return checks;
}

export function overall(checks: Check[]): State {
  if (checks.some((c) => c.state === 'down' && c.key !== 'jobs')) return 'down';
  return checks.some((c) => c.state !== 'up') ? 'degraded' : 'up';
}

async function record(checks: Check[]) {
  await withService(async (tx) => {
    const [recent] = await tx`select 1 from public.status_checks where at > now() - interval '1 minute' limit 1`;
    if (recent) return;
    for (const c of checks) {
      await tx`insert into public.status_checks (component, state, latency_ms) values (${c.key}, ${c.state}, ${c.latency_ms})`;
    }
    if (Math.random() < 0.01) await tx`delete from public.status_checks where at < now() - interval '90 days'`;
  });
}

export interface StatusPayload {
  overall: State;
  checked_at: string;
  components: Check[];
  api: {
    requests_24h: number;
    error_rate_24h: number;
    p50_ms: number | null;
    p95_ms: number | null;
    hourly: { hour: string; requests: number; errors: number; p50_ms: number | null; p95_ms: number | null }[];
  };
  /** Per component, per day (oldest first): share of checks that were up, or null without data. */
  history: Record<string, { day: string; uptime: number | null; avg_ms: number | null }[]>;
}

let cache: { at: number; data: StatusPayload } | null = null;

export async function statusPayload(): Promise<StatusPayload> {
  if (cache && Date.now() - cache.at < 15_000) return cache.data;
  const components = await runChecks();
  await record(components).catch(() => undefined);
  const [summary, hourly, days] = await withService(async (tx) => Promise.all([
    tx<{ total: number; errors: number; p50: number | null; p95: number | null }[]>`
      select count(*)::int as total, count(*) filter (where status >= 500)::int as errors,
             (percentile_cont(0.5) within group (order by duration_ms))::int as p50,
             (percentile_cont(0.95) within group (order by duration_ms))::int as p95
        from public.api_request_logs where at > now() - interval '24 hours'`,
    tx<{ hour: Date; requests: number; errors: number; p50: number | null; p95: number | null }[]>`
      select h.hour, count(l.id)::int as requests, count(l.id) filter (where l.status >= 500)::int as errors,
             (percentile_cont(0.5) within group (order by l.duration_ms))::int as p50,
             (percentile_cont(0.95) within group (order by l.duration_ms))::int as p95
        from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h(hour)
        left join public.api_request_logs l on l.at >= h.hour and l.at < h.hour + interval '1 hour'
       group by h.hour order by h.hour`,
    tx<{ component: string; day: Date; uptime: number | null; avg_ms: number | null }[]>`
      select c.component, d.day,
             (avg(case s.state when 'up' then 1.0 when 'degraded' then 0.5 when 'down' then 0 end))::float as uptime,
             (avg(s.latency_ms))::int as avg_ms
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d(day)
        cross join (values ('api'), ('database'), ('auth'), ('storage'), ('jobs')) c(component)
        left join public.status_checks s on s.component = c.component and s.at >= d.day and s.at < d.day + interval '1 day'
       group by c.component, d.day order by c.component, d.day`,
  ]));
  const s = summary[0];
  const history: StatusPayload['history'] = {};
  for (const r of days) {
    if (!components.some((c) => c.key === r.component)) continue;
    (history[r.component] ??= []).push({ day: r.day.toISOString(), uptime: r.uptime, avg_ms: r.avg_ms });
  }
  const data: StatusPayload = {
    overall: overall(components),
    checked_at: new Date().toISOString(),
    components,
    api: {
      requests_24h: s.total,
      error_rate_24h: s.total ? s.errors / s.total : 0,
      p50_ms: s.p50,
      p95_ms: s.p95,
      hourly: hourly.map((h) => ({ hour: h.hour.toISOString(), requests: h.requests, errors: h.errors, p50_ms: h.p50, p95_ms: h.p95 })),
    },
    history,
  };
  cache = { at: Date.now(), data };
  return data;
}

export function clearStatusCache() {
  cache = null;
}
