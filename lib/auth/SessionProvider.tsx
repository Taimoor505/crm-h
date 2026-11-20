'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, revokeSession, type VerifyResult } from '@/lib/api/endpoints/auth';
import type { Me, Role, Workspace } from '@/lib/api/types';
import { qk } from '@/hooks/queries/keys';
import { setAppState } from '@/lib/app-state';
import { clearSession, getSession, setSession, subscribeSession, updateSession, type Session } from './session';

interface SessionContextValue {
  session: Session | null;
  /** Ready once the session has been read from storage on the client. */
  hydrated: boolean;
  me: Me | null;
  meLoading: boolean;
  meError: unknown;
  role: Role | null;
  workspace: Workspace | null;
  workspaceId: string | null;
  signIn: (r: VerifyResult) => void;
  signOut: () => void;
  switchWorkspace: (id: string) => void;
  impersonate: (ws: { id: string; name: string }, returnTo?: string) => void;
  exitImpersonation: () => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const serverSnapshot = () => undefined;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  // undefined on the server and the first client render, then the stored session.
  const session = useSyncExternalStore(subscribeSession, getSession, serverSnapshot) as Session | null | undefined;
  const hydrated = session !== undefined;
  const workspaceId = session?.impersonating?.workspaceId ?? session?.workspaceId ?? null;

  const meQuery = useQuery({
    queryKey: qk.me(workspaceId),
    queryFn: () => getMe(workspaceId),
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
  });
  const me = meQuery.data ?? null;

  // Adopt the workspace /me resolved when the session had none yet.
  useEffect(() => {
    if (session && !session.workspaceId && me?.workspace) updateSession({ workspaceId: me.workspace.id });
  }, [session, me]);

  useEffect(() => {
    const status = me?.workspace?.status;
    setAppState({ readOnly: status === 'read_only' || status === 'archived', suspended: status === 'suspended' });
  }, [me?.workspace?.status]);

  const signIn = useCallback(
    (r: VerifyResult) => {
      qc.clear();
      setSession({
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: r.expires_at,
        userId: r.user_id,
        workspaceId: r.memberships[0]?.workspace_id ?? null,
        impersonating: null,
      });
    },
    [qc],
  );

  const signOut = useCallback(() => {
    revokeSession(getSession()?.accessToken);
    clearSession();
    qc.clear();
    setAppState({ readOnly: false, suspended: false });
  }, [qc]);

  const switchWorkspace = useCallback(
    (id: string) => {
      updateSession({ workspaceId: id, impersonating: null });
      setAppState({ readOnly: false, suspended: false });
    },
    [],
  );

  const impersonate = useCallback((ws: { id: string; name: string }, returnTo?: string) => {
    updateSession({ impersonating: { workspaceId: ws.id, workspaceName: ws.name, returnTo: returnTo ?? null } });
    setAppState({ readOnly: false, suspended: false });
  }, []);

  const exitImpersonation = useCallback(() => {
    const returnTo = getSession()?.impersonating?.returnTo ?? null;
    updateSession({ impersonating: null });
    return returnTo;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session: session ?? null,
      hydrated,
      me,
      meLoading: meQuery.isLoading,
      meError: meQuery.error,
      role: me?.role ?? null,
      workspace: me?.workspace ?? null,
      workspaceId,
      signIn,
      signOut,
      switchWorkspace,
      impersonate,
      exitImpersonation,
    }),
    [session, hydrated, me, meQuery.isLoading, meQuery.error, workspaceId, signIn, signOut, switchWorkspace, impersonate, exitImpersonation],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** The active workspace id; only call inside the signed-in app shell. */
export function useWorkspaceId(): string {
  const { workspaceId } = useSession();
  return workspaceId ?? '';
}
