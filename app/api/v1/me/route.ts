import { z } from 'zod';
import { ApiError, authRoute, json, readJson } from '@/server/http';
import { loadUser, mePayload } from '@/server/core/identity';

// GET /me: the signed-in user, their memberships and the active workspace + role.
// While an owner is signed in as a teammate it describes the teammate, limited
// to this workspace, plus `signed_in_as` (who is really acting, and until when).
export const GET = authRoute(async ({ req, tx, userId, signedInAs }) => {
  const ws = req.headers.get('x-workspace-id');
  if (ws && !z.uuid().safeParse(ws).success) throw new ApiError(400, 'bad_request', 'X-Workspace-Id must be a uuid');
  const me = await mePayload(tx, userId, ws || null);
  if (!signedInAs) return json({ ...me, signed_in_as: null });
  const by = await loadUser(tx, signedInAs.ownerId);
  return json({
    ...me,
    user: { ...me.user, is_super_admin: false },
    memberships: me.memberships.filter((m) => m.workspace_id === signedInAs.workspaceId),
    signed_in_as: { id: signedInAs.id, expires_at: signedInAs.expiresAt, by: { id: by.id, name: by.name, email: by.email } },
  });
}, { signInAs: 'resolve' });

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
