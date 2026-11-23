import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { withService } from '../db';

/**
 * API request log. `logged()` wraps a route handler: it times the call and,
 * after the response is sent, stores one row in public.api_request_logs.
 * Bodies are never stored; sensitive query values are masked; IPs are truncated.
 * userRoute/authRoute tag the row with the caller and workspace.
 */
interface ReqCtx {
  requestId: string;
  userId?: string;
  workspaceId?: string;
  signedInAsBy?: string;
}

const als = new AsyncLocalStorage<ReqCtx>();

/** Adds the caller to the current request's log row (no-op outside a logged request). */
export function tagRequest(p: { userId?: string; workspaceId?: string; signedInAsBy?: string }) {
  const c = als.getStore();
  if (c) Object.assign(c, p);
}

export interface LogEntry {
  request_id: string;
  method: string;
  route: string;
  path: string;
  status: number;
  duration_ms: number;
  user_id: string | null;
  workspace_id: string | null;
  /** The owner really acting during "Sign in as" (user_id is the teammate). */
  signed_in_as_by: string | null;
  error_code: string | null;
  ip: string | null;
  user_agent: string | null;
  region: string | null;
}

/** Polling these would drown the log. */
const SKIP = new Set(['/api/v1/dev/logs', '/api/v1/status']);
const SENSITIVE = /token|code|state|password|secret|key|signature|otp|hub\.challenge/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function routeOf(pathname: string): string {
  return pathname.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');
}

export function safePath(url: URL): string {
  const q = [...url.searchParams.entries()].map(([k, v]) => `${k}=${SENSITIVE.test(k) ? '***' : v.slice(0, 80)}`);
  return url.pathname + (q.length ? `?${q.join('&')}` : '');
}

export function maskIp(raw: string | null): string | null {
  const ip = raw?.split(',')[0]?.trim();
  if (!ip) return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 3).concat('0').join('.');
  return `${ip.split(':').slice(0, 3).join(':')}::`;
}

/** Called during the request; `errorCode` resolves once the response body is read. */
type Sink = (e: Omit<LogEntry, 'error_code'>, errorCode: Promise<string | null>) => void;

async function insert(e: LogEntry) {
  await withService(async (tx) => {
    await tx`insert into public.api_request_logs ${tx(e as never)}`;
    // Keep two weeks.
    if (Math.random() < 0.005) await tx`delete from public.api_request_logs where at < now() - interval '14 days'`;
  });
}

const defaultSink: Sink = (e, errorCode) => {
  if (process.env.API_LOGS === 'off') return;
  const run = async () => {
    try {
      await insert({ ...e, error_code: await errorCode });
    } catch (err) {
      console.error('[api-log] write failed', err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
};

let sink: Sink = defaultSink;
/** Tests capture entries here. */
export function setLogSink(s: Sink | null) {
  sink = s ?? defaultSink;
}

async function errorCodeOf(res: Response): Promise<string | null> {
  if (res.status < 400 || !res.headers.get('content-type')?.includes('json')) return null;
  try {
    const j = (await res.clone().json()) as { error?: { code?: string } | string };
    return typeof j.error === 'string' ? j.error : (j.error?.code ?? null);
  } catch {
    return null;
  }
}

/** Wraps a route handler with request logging. Nested wrappers log once. */
export function logged<R extends Request, A extends unknown[]>(
  handler: (req: R, ...rest: A) => Response | Promise<Response>,
): (req: R, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    if (als.getStore()) return handler(req, ...rest);
    const url = new URL(req.url);
    const ctx: ReqCtx = { requestId: req.headers.get('x-vercel-id') ?? randomUUID() };
    const started = performance.now();
    let res: Response | null = null;
    try {
      res = await als.run(ctx, () => handler(req, ...rest));
      return res;
    } finally {
      if (!SKIP.has(url.pathname)) {
        const status = res?.status ?? 500;
        const duration = Math.round(performance.now() - started);
        const codeP = res ? errorCodeOf(res) : Promise.resolve('unhandled_exception');
        sink(
          {
            request_id: ctx.requestId,
            method: req.method,
            route: routeOf(url.pathname),
            path: safePath(url),
            status,
            duration_ms: duration,
            user_id: ctx.userId ?? null,
            workspace_id: ctx.workspaceId ?? null,
            signed_in_as_by: ctx.signedInAsBy ?? null,
            ip: maskIp(req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip')),
            user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
            region: process.env.VERCEL_REGION ?? null,
          },
          codeP,
        );
      }
    }
  };
}
