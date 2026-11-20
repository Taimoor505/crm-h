/**
 * The one place that talks HTTP to /api/v1. Adds the session token and the
 * active workspace, and turns both backend error shapes into ApiError.
 */
import { activeWorkspaceId, getSession, updateSession } from '@/lib/auth/session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'too_large',
  422: 'validation_failed',
  429: 'rate_limited',
};

/** Errors from the sandbox routes are `{ error: "text" }`; Postgres routes send `{ error: { code, message, details } }`. */
export function toApiError(status: number, body: unknown): ApiError {
  const err = (body as { error?: unknown } | null)?.error;
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: unknown };
    return new ApiError(status, e.code ?? STATUS_CODES[status] ?? 'error', e.message ?? 'Request failed', e.details);
  }
  const message = typeof err === 'string' ? err : 'Request failed';
  // Sandbox messages carry the read-only/suspended state in text only.
  let code = STATUS_CODES[status] ?? (status >= 500 ? 'internal' : 'error');
  if (status === 403 && /read.?only/i.test(message)) code = 'workspace_read_only';
  if (status === 403 && /suspended/i.test(message)) code = 'workspace_suspended';
  const details = body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
  return new ApiError(status, code, message, details);
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  form?: FormData;
  /** Override the workspace header; `false` sends none. */
  workspaceId?: string | false;
  partnerId?: string;
  /** Skip the Authorization header (public endpoints such as OTP). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export const API_BASE = '/api/v1';

function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ''}`;
}

/** Listeners for global error handling (QueryClient wires these up). */
type ErrorListener = (e: ApiError) => void;
const errorListeners = new Set<ErrorListener>();
export function onApiError(l: ErrorListener) {
  errorListeners.add(l);
  return () => errorListeners.delete(l);
}

let refreshing: Promise<boolean> | null = null;

/**
 * Swaps the refresh token for a new access token (single flight across
 * concurrent requests). Returns false only when the server says the session
 * is over; a network failure keeps the session so the person isn't signed
 * out by a flaky connection.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  const s = getSession();
  if (!s?.refreshToken) return Promise.resolve(false);
  const used = s.refreshToken;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refresh_token: used }),
        cache: 'no-store',
      });
      if (!res.ok) {
        // Another tab may have rotated the token meanwhile; use theirs.
        const now = getSession();
        return Boolean(now?.refreshToken && now.refreshToken !== used);
      }
      const r = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number };
      updateSession({ accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at * 1000 });
      return true;
    } catch {
      return true;
    } finally {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

const REFRESH_MARGIN_MS = 90_000;

export async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  if (!opts.anonymous) {
    const s = getSession();
    if (s?.refreshToken && s.expiresAt && s.expiresAt - Date.now() < REFRESH_MARGIN_MS) await refreshAccessToken();
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  const session = getSession();
  if (!opts.anonymous && session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  const ws = opts.workspaceId === false ? null : opts.workspaceId ?? activeWorkspaceId();
  if (ws) headers['x-workspace-id'] = ws;
  if (opts.partnerId) headers['x-partner-id'] = opts.partnerId;

  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'You appear to be offline');
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (res.status === 401 && !opts.anonymous && !retried && getSession()?.refreshToken) {
    if (await refreshAccessToken()) return request<T>(path, opts, true);
  }
  if (!res.ok) {
    const err = toApiError(res.status, parsed);
    errorListeners.forEach((l) => l(err));
    throw err;
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: Query, opts?: Omit<RequestOptions, 'query' | 'method'>) =>
    request<T>(path, { ...opts, query, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'POST' }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'PUT' }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'PATCH' }),
  delete: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body, method: 'DELETE' }),
};
