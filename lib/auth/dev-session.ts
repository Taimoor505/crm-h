/**
 * Development-only identities. Sandbox tokens (`taimoor_tok_*`) and the mock
 * backend's `mock.*` tokens must never be minted outside development: every
 * export is a no-op unless dev tools are enabled, so production code paths
 * can't reach them.
 */
import { isDevToolsEnabled } from '@/lib/dev-tools';
import { mockMode } from '@/mocks/mode';
import { setSession } from './session';

export function devTokenFor(userId: string): string | null {
  if (!isDevToolsEnabled()) return null;
  return mockMode() === 'all' ? `mock.${userId}` : `taimoor_tok_${userId}`;
}

export function devSignInAs(userId: string, workspaceId: string | null) {
  const token = devTokenFor(userId);
  if (!token) return;
  setSession({ accessToken: token, refreshToken: null, expiresAt: null, userId, workspaceId, impersonating: null });
}
