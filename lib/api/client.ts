/**
 * The one place that talks HTTP to /api/v1. Adds the session token and the
 * active workspace, and turns both backend error shapes into ApiError.
 */
import { activeWorkspaceId, getSession } from '@/lib/auth/session';

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

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
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
