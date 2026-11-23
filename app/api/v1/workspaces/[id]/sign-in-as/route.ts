import { z } from 'zod';
import { withService } from '@/server/db';
import { ApiError, authRoute, json, readJson, userRoute } from '@/server/http';
import { endSignInAs, startSignInAs } from '@/server/core/sign-in-as';
import { maskIp } from '@/server/observability/request-log';

type P = { id: string };

/**
 * POST /workspaces/:id/sign-in-as { user_id } (owners only): start working as
 * a manager or agent of this workspace. Returns the session id the client
 * sends as x-sign-in-as on later requests; it lasts SIGN_IN_AS_HOURS.
 */
export const POST = userRoute<P>({ blockSignInAs: true }, async ({ req, params, workspace, userId }) => {
  if (params.id !== workspace.id) throw new ApiError(400, 'bad_request', 'Workspace in the path and X-Workspace-Id differ');
  const b = await readJson(req, z.object({ user_id: z.uuid() }));
  // Owner checks need rows RLS may hide from the caller; startSignInAs authorises itself.
  const session = await withService((tx) =>
    startSignInAs(tx, {
      workspaceId: workspace.id,
      ownerId: userId,
      targetUserId: b.user_id,
      ip: maskIp(req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip')),
      userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    }),
  );
  return json({ sign_in_as: session }, 201);
});

/**
 * DELETE /workspaces/:id/sign-in-as: "Return to my account". Runs as the real
 * owner even while the x-sign-in-as header is still being sent, and ends their
 * open session in this workspace. Safe to repeat.
 */
export const DELETE = authRoute<P>(async ({ params, tx, userId }) => {
  if (!z.uuid().safeParse(params.id).success) throw new ApiError(400, 'bad_request', 'Malformed workspace id');
  const ended = await endSignInAs(tx, params.id, userId);
  return json({ ended });
}, { signInAs: 'ignore' });

export const dynamic = 'force-dynamic';
