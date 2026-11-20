import { z } from 'zod';
import { ApiError, authRoute, json, readJson } from '@/server/http';
import { loadUser, mePayload } from '@/server/core/identity';

// GET /me: the signed-in user, their memberships and the active workspace + role.
export const GET = authRoute(async ({ req, tx, userId }) => {
  const ws = req.headers.get('x-workspace-id');
  if (ws && !z.uuid().safeParse(ws).success) throw new ApiError(400, 'bad_request', 'X-Workspace-Id must be a uuid');
  return json(await mePayload(tx, userId, ws || null));
});

// PATCH /me: own name and phone.
export const PATCH = authRoute(async ({ req, tx, userId }) => {
  const b = await readJson(req, z.object({
    name: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().max(20).regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in international format, e.g. +14155550123').nullable().optional(),
  }));
  if (b.name !== undefined) await tx`update public.users set name = ${b.name} where id = ${userId}`;
  if (b.phone !== undefined) await tx`update public.users set phone = ${b.phone} where id = ${userId}`;
  return json({ user: await loadUser(tx, userId) });
});
export const dynamic = 'force-dynamic';
