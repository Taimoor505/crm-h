import { api } from '../client';
import { adaptMembership, adaptResolvedBranding, adaptUser, adaptWorkspace, type Raw } from '../adapters';
import type { Me, ResolvedBranding, Role } from '../types';

export async function sendOtp(phoneE164: string) {
  const r = await api.post<Raw>('/auth/otp/send', { phone: phoneE164 }, { anonymous: true, workspaceId: false });
  return { phone_e164: r.phone_e164 as string, expires_in_seconds: (r.expires_in_seconds as number) ?? 300, debug_code: (r.debug_code ?? r.sandbox_code ?? null) as string | null };
}

export interface VerifyResult {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  user_id: string;
  memberships: ReturnType<typeof adaptMembership>[];
}

export async function verifyOtp(phoneE164: string, code: string): Promise<VerifyResult> {
  const r = await api.post<Raw>('/auth/otp/verify', { phone: phoneE164, code }, { anonymous: true, workspaceId: false });
  return {
    access_token: r.access_token,
    // TODO(auth): sandbox tokens have no refresh token or expiry (brief §12.7).
    refresh_token: r.refresh_token ?? null,
    expires_at: r.expires_at ? Number(r.expires_at) * 1000 : null,
    user_id: r.user.id,
    memberships: (r.memberships ?? []).map(adaptMembership),
  };
}

export async function getMe(workspaceId: string | null): Promise<Me> {
  const r = await api.get<Raw>('/me', undefined, { workspaceId: workspaceId ?? false });
  const user = adaptUser(r.user);
  let role: Role = r.effective_role ?? 'agent';
  if (user.is_super_admin && !r.active_workspace) role = 'super_admin';
  return {
    user,
    workspace: r.active_workspace ? adaptWorkspace(r.active_workspace) : null,
    role,
    memberships: (r.memberships ?? []).map(adaptMembership),
  };
}

export async function getBranding(params: { workspaceId?: string | null; host?: string }): Promise<ResolvedBranding> {
  const r = await api.get<Raw>(
    '/branding',
    { workspace_id: params.workspaceId ?? undefined, host: params.host },
    { anonymous: !params.workspaceId, workspaceId: false },
  );
  return adaptResolvedBranding(r);
}
