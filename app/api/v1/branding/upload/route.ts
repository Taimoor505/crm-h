import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, authRoute, json } from '@/server/http';
import { env } from '@/server/env';
import { storage } from '@/server/storage';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico' };
const MAX = 1024 * 1024;

/**
 * POST /branding/upload (multipart: file, kind=logo|favicon, scope=workspace|partner).
 * Workspace owners/managers upload for their workspace (X-Workspace-Id);
 * partner admins for their partner. Returns a public https URL to save as
 * branding.logoUrl / faviconUrl.
 */
export const POST = authRoute(async ({ req, tx, userId }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError(400, 'bad_request', 'Send the image as multipart/form-data');
  const file = form.get('file');
  const kind = z.enum(['logo', 'favicon']).catch('logo').parse(form.get('kind'));
  const scope = z.enum(['workspace', 'partner']).catch('workspace').parse(form.get('scope'));
  if (!(file instanceof File) || file.size === 0) throw new ApiError(422, 'validation_failed', 'Choose an image file');
  if (file.size > MAX) throw new ApiError(413, 'too_large', 'Images must be 1 MB or smaller');
  const ext = TYPES[file.type];
  if (!ext) throw new ApiError(422, 'validation_failed', 'Use a PNG, JPG, WebP, SVG or ICO image');

  let owner: string;
  if (scope === 'partner') {
    const [u] = await tx<{ partner_admin_of: string | null }[]>`select partner_admin_of from public.users where id = ${userId}`;
    if (!u?.partner_admin_of) throw new ApiError(403, 'forbidden', 'Partner admins only');
    owner = `partners/${u.partner_admin_of}`;
  } else {
    const ws = req.headers.get('x-workspace-id') ?? '';
    if (!z.uuid().safeParse(ws).success) throw new ApiError(400, 'workspace_required', 'X-Workspace-Id header (uuid) is required');
    const [m] = await tx`
      select 1 from public.memberships m where m.workspace_id = ${ws} and m.user_id = ${userId} and m.status = 'active' and m.role in ('owner', 'manager')
      union all
      select 1 from public.workspaces w join public.users u on u.partner_admin_of = w.partner_id where w.id = ${ws} and u.id = ${userId}`;
    if (!m) throw new ApiError(403, 'forbidden', 'Only workspace owners and managers can change branding');
    owner = `workspaces/${ws}`;
  }
  if (ext === 'svg') {
    const text = await file.text();
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(text)) throw new ApiError(422, 'validation_failed', 'This SVG contains scripts; export it again without them');
  }
  const path = `${owner}/${kind}-${randomUUID()}.${ext}`;
  await storage().upload('branding', path, file, file.type);
  return json({ url: `${env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/branding/${path}` }, 201);
});
