import { json } from '@/server/http';
import { logged } from '@/server/observability/request-log';
import { statusPayload } from '@/server/observability/status';

// GET /status (public): live component health, API speed and 30-day uptime.
async function GET_handler() {
  try {
    return json({ data: await statusPayload() }, 200, { 'cache-control': 'no-store' });
  } catch {
    // The database itself is unreachable.
    return json({
      data: {
        overall: 'down', checked_at: new Date().toISOString(),
        components: [{ key: 'api', state: 'up', latency_ms: null }, { key: 'database', state: 'down', latency_ms: null }],
        api: { requests_24h: 0, error_rate_24h: 0, p50_ms: null, p95_ms: null, hourly: [] },
        history: {},
      },
    }, 200, { 'cache-control': 'no-store' });
  }
}

export const GET = logged(GET_handler);
export const dynamic = 'force-dynamic';
