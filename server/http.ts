import { z, ZodError } from 'zod';
import { bearerToken, verifyAccessToken } from './auth';
import { withService, withUser, type Tx } from './db';
import { logged, tagRequest } from './observability/request-log';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(err: unknown, headers?: HeadersInit): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status, headers);
  }
  if (err instanceof ZodError) {
    return json(
      {
        error: {
          code: 'validation_failed',
          message: 'Request is invalid',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      422,
      headers,
    );
  }
  const pg = err as { code?: string; message?: string };
  switch (pg?.code) {
    case '42501':
      return json({ error: { code: 'forbidden', message: 'Not allowed' } }, 403, headers);
    case '23505':
      return json({ error: { code: 'conflict', message: 'Already exists' } }, 409, headers);
    case '23503':
      return json({ error: { code: 'invalid_reference', message: 'Referenced record not found' } }, 422, headers);
    case '22P02':
      return json({ error: { code: 'bad_request', message: 'Malformed identifier' } }, 400, headers);
  }
  console.error('[api] unhandled error', err);
  return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500, headers);
}

export type Role = 'owner' | 'manager' | 'agent';

export interface WorkspaceCtx {
  id: string;
  role: Role;
  timezone: string;
  status: string;
}

export interface UserCtx<P> {
  req: Request;
  params: P;
  userId: string;
  workspace: WorkspaceCtx;
  isManager: boolean;
  tx: Tx;
}

type NextHandler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

const uuid = z.uuid();

/**
 * Wraps an authenticated, workspace-scoped endpoint:
 *  - verifies the Supabase access token
 *  - resolves X-Workspace-Id and the caller's active membership
 *  - runs the handler in one transaction as that user (RLS enforced)
 *  - blocks writes when the workspace is read-only or archived (unpaid
 *    billing), and everything when it is suspended
 */
export function userRoute<P = Record<string, string>>(
  opts: {
    managerOnly?: boolean;
    /** Personal actions (mark read, availability, settings) still work when unpaid. */
    allowWhenReadOnly?: boolean;
  },
  handler: (c: UserCtx<P>) => Promise<Response>,
): NextHandler<P> {
  return logged(async (req, ctx) => {
    try {
      const { userId } = await verifyAccessToken(bearerToken(req));
      tagRequest({ userId });
      const wsHeader = req.headers.get('x-workspace-id');
      const ws = uuid.safeParse(wsHeader);
      if (ws.success) tagRequest({ workspaceId: ws.data });
      if (!ws.success) throw new ApiError(400, 'workspace_required', 'X-Workspace-Id header (uuid) is required');
      const params = (await ctx?.params) ?? ({} as P);

      return await withUser(userId, async (tx) => {
        // A member, or an admin of the workspace's partner (support access,
        // treated as a manager, the same as Taimoor's RLS helpers).
        const [m] = await tx<{ role: Role; timezone: string; status: string }[]>`
          select coalesce(m.role, 'manager') as role, w.timezone, w.status
          from public.workspaces w
          left join public.memberships m
            on m.workspace_id = w.id and m.user_id = ${userId} and m.status = 'active'
          left join public.users u on u.id = ${userId}
          where w.id = ${ws.data}
            and (m.id is not null or u.partner_admin_of = w.partner_id)`;
        if (!m) throw new ApiError(403, 'not_a_member', 'You are not a member of this workspace');
        const isManager = m.role === 'owner' || m.role === 'manager';
        if (opts.managerOnly && !isManager) {
          throw new ApiError(403, 'forbidden', 'Only workspace owners and managers can do this');
        }
        if (m.status === 'suspended') {
          throw new ApiError(403, 'workspace_suspended', 'This workspace is suspended; contact support');
        }
        if (req.method !== 'GET' && m.status !== 'active' && !opts.allowWhenReadOnly) {
          throw new ApiError(403, 'workspace_read_only', `Workspace is ${m.status}; changes are disabled`);
        }
        return handler({
          req,
          params,
          userId,
          workspace: { id: ws.data, role: m.role, timezone: m.timezone, status: m.status },
          isManager,
          tx,
        });
      });
    } catch (err) {
      return errorResponse(err);
    }
  });
}

/**
 * Wraps an endpoint that only needs a signed-in user (no workspace). The
 * handler gets a service-role transaction and must authorise the user itself
 * (billing and super-admin endpoints, whose tables have no RLS policies).
 */
export function authRoute<P = Record<string, string>>(
  handler: (c: { req: Request; params: P; userId: string; tx: Tx }) => Promise<Response>,
): NextHandler<P> {
  return logged(async (req, ctx) => {
    try {
      const { userId } = await verifyAccessToken(bearerToken(req));
      tagRequest({ userId });
      const params = (await ctx?.params) ?? ({} as P);
      return await withService((tx) => handler({ req, params, userId, tx }));
    } catch (err) {
      return errorResponse(err);
    }
  });
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'bad_json', 'Body must be valid JSON');
  }
  return schema.parse(body);
}

export function readQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams));
}

// Cursor pagination: opaque base64url of the last row's sort key.
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new ApiError(400, 'bad_cursor', 'Invalid cursor');
  }
}

export const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
