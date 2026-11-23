/**
 * Development-only identities for the mock backend (`mock.*` tokens). They
 * must never be minted outside development: every export is a no-op unless dev
 * tools are enabled and the API is fully mocked, so production code paths
 * can't reach them. The real backend only accepts Supabase tokens.
 */
import { isDevToolsEnabled } from '@/lib/dev-tools';
import { mockMode } from '@/mocks/mode';
import { setSession } from './session';

export function devTokenFor(userId: string): string | null {
  if (!isDevToolsEnabled() || mockMode() !== 'all') return null;
  return `mock.${userId}`;
}

export function devSignInAs(userId: string, workspaceId: string | null) {
  const token = devTokenFor(userId);
  if (!token) return;
  setSession({ accessToken: token, refreshToken: null, expiresAt: null, userId, workspaceId, impersonating: null });
}
