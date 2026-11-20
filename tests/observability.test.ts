import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, call, createUser, team } from './helpers';
import { maskIp, routeOf, safePath, setLogSink, type LogEntry } from '@/server/observability/request-log';
import { clearStatusCache } from '@/server/observability/status';
import * as contacts from '@/app/api/v1/contacts/route';
import * as contact from '@/app/api/v1/contacts/[id]/route';
import * as health from '@/app/api/v1/health/route';
import * as logs from '@/app/api/v1/dev/logs/route';
import * as status from '@/app/api/v1/status/route';

describe('request logging', () => {
  const seen: LogEntry[] = [];
  beforeAll(() => setLogSink(async (e, code) => void seen.push({ ...e, error_code: await code })));
  afterAll(() => setLogSink(null));
  const settle = () => new Promise((r) => setTimeout(r, 10));

  it('normalises routes and hides sensitive values', () => {
    expect(routeOf('/api/v1/contacts/2b1f3c1e-1111-4111-8111-111111111111/notes')).toBe('/api/v1/contacts/:id/notes');
    expect(safePath(new URL('https://x/api/v1/integrations/google/callback?code=abc&state=s&x=1'))).toBe('/api/v1/integrations/google/callback?code=***&state=***&x=1');
    expect(maskIp('203.0.113.77, 10.0.0.1')).toBe('203.0.113.0');
  });

  it('logs caller, workspace, status, timing and error code once per request', async () => {
    const t = await team('Logs Co');
    seen.length = 0;
    await call(contacts.GET, { as: t.ali, ws: t.ws, headers: { 'user-agent': 'vitest', 'x-forwarded-for': '198.51.100.9' } });
    await call(contact.GET, { as: t.ali, ws: t.ws, path: '/api/v1/contacts/00000000-0000-4000-8000-000000000000', params: { id: '00000000-0000-4000-8000-000000000000' } });
    await call(health.GET, { path: '/api/v1/health' });
    await settle();
    expect(seen).toHaveLength(3);
    expect(seen[0]).toMatchObject({ method: 'GET', status: 200, user_id: t.ali, workspace_id: t.ws, ip: '198.51.100.0', user_agent: 'vitest', error_code: null });
    expect(seen[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(seen[1]).toMatchObject({ route: '/api/v1/contacts/:id', status: 404, error_code: 'not_found' });
    expect(seen[2]).toMatchObject({ route: '/api/v1/health', user_id: null });
  });
});

describe('developer logs and status endpoints', () => {
  it('lets only super-admins read logs, with filters and a summary', async () => {
    const t = await team('Logs Admin Co');
    const dev = await createUser('Dev Dana');
    await admin`insert into public.platform_admins (user_id) values (${dev}) on conflict do nothing`;
    await admin`insert into public.api_request_logs (request_id, method, route, path, status, duration_ms, user_id, workspace_id, error_code)
                values ('r1', 'GET', '/api/v1/contacts', '/api/v1/contacts', 200, 40, ${t.ali}, ${t.ws}, null),
                       ('r2', 'POST', '/api/v1/deals', '/api/v1/deals', 422, 12, ${t.ali}, ${t.ws}, 'validation_failed'),
                       ('r3', 'GET', '/api/v1/reports/funnel', '/api/v1/reports/funnel', 500, 2300, ${t.manager}, ${t.ws}, 'internal')`;

    expect((await call(logs.GET, { as: t.manager })).status).toBe(403);

    const all = await call(logs.GET, { as: dev, query: { workspace_id: t.ws } });
    expect(all.status).toBe(200);
    expect(all.body.data.map((r: { request_id: string }) => r.request_id)).toEqual(['r3', 'r2', 'r1']);
    expect(all.body.data[0]).toMatchObject({ user_name: 'Manager Mehwish', workspace_name: 'Logs Admin Co' });
    expect(all.body.summary.requests).toBeGreaterThanOrEqual(3);

    const errors = await call(logs.GET, { as: dev, query: { workspace_id: t.ws, status: 'errors' } });
    expect(errors.body.data).toHaveLength(2);
    const slow = await call(logs.GET, { as: dev, query: { workspace_id: t.ws, slow: 'true' } });
    expect(slow.body.data.map((r: { request_id: string }) => r.request_id)).toEqual(['r3']);
    const search = await call(logs.GET, { as: dev, query: { workspace_id: t.ws, q: 'validation' } });
    expect(search.body.data.map((r: { request_id: string }) => r.request_id)).toEqual(['r2']);
    const paged = await call(logs.GET, { as: dev, query: { workspace_id: t.ws, limit: '2' } });
    expect(paged.body.data).toHaveLength(2);
    const next = await call(logs.GET, { as: dev, query: { workspace_id: t.ws, limit: '2', before: String(paged.body.next_before) } });
    expect(next.body.data.map((r: { request_id: string }) => r.request_id)).toEqual(['r1']);
  });

  it('reports live component health and records history', async () => {
    clearStatusCache();
    const res = await call(status.GET, { path: '/api/v1/status' });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.components.find((c: { key: string }) => c.key === 'database')).toMatchObject({ state: 'up' });
    expect(d.api.hourly).toHaveLength(24);
    expect(d.history.database).toHaveLength(30);
    // Days before any check are "no data", not outages.
    expect(d.history.database[0].uptime).toBeNull();
    expect(d.history.database[29].uptime).toBe(1);
    expect(['up', 'degraded', 'down']).toContain(d.overall);
    const [{ n }] = await admin`select count(*)::int as n from public.status_checks where component = 'database'`;
    expect(n).toBeGreaterThan(0);
  });
});
