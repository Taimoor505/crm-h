'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, revokeSession, type VerifyResult } from '@/lib/api/endpoints/auth';
import { endSignInAs, startSignInAs } from '@/lib/api/endpoints/crm';
import type { Me, Role, Workspace } from '@/lib/api/types';
import { qk } from '@/hooks/queries/keys';
import { setAppState } from '@/lib/app-state';
import { clearSession, getSession, isIdleExpired, setSession, subscribeSession, touchActivity, updateSession, type Session } from './session';

interface SessionContextValue {
  session: Session | null;
  /** Ready once the session has been read from storage on the client. */
  hydrated: boolean;
  /** Who the app acts as: the teammate during "Sign in as", else the signed-in user. */
  userId: string | null;
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
  /** Owners: work as a manager or agent of the active workspace. */
  signInAs: (userId: string) => Promise<void>;
  /** End "Sign in as" and go back to the owner's own view. */
  returnToMyAccount: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const serverSnapshot = () => undefined;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  // undefined on the server and the first client render, then the stored session.
  const session = useSyncExternalStore(subscribeSession, getSession, serverSnapshot) as Session | null | undefined;
  const hydrated = session !== undefined;
  const workspaceId = session?.impersonating?.workspaceId ?? session?.workspaceId ?? null;

  const signInAsId = session?.signInAs?.id ?? null;
  const meQuery = useQuery({
    queryKey: [...qk.me(workspaceId), signInAsId],
    queryFn: () => getMe(workspaceId),
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
  });
  const me = meQuery.data ?? null;

  // Starting or ending "Sign in as" changes who every query is for: drop all cached data.
  const lastSignInAs = useRef(signInAsId);
  useEffect(() => {
    if (lastSignInAs.current === signInAsId) return;
    lastSignInAs.current = signInAsId;
    qc.clear();
  }, [signInAsId, qc]);

  // The server no longer knows the session (ended elsewhere, or a mock reload): drop it.
  useEffect(() => {
    if (signInAsId && me && !meQuery.isFetching && me.signedInAs?.id !== signInAsId) updateSession({ signInAs: null });
  }, [signInAsId, me, meQuery.isFetching]);

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
        signInAs: null,
        lastActiveAt: Date.now(),
      });
    },
    [qc],
  );

  const signOut = useCallback(() => {
    const s = getSession();
    if (s?.signInAs) void endSignInAs(s.signInAs.workspaceId).catch(() => undefined);
    revokeSession(s?.accessToken);
    clearSession();
    qc.clear();
    setAppState({ readOnly: false, suspended: false });
  }, [qc]);

  // Idle sign-out: record activity; on return to the tab, sign out after 24h idle.
  const signedIn = Boolean(session);
  useEffect(() => {
    if (!signedIn) return;
    const check = () => {
      if (isIdleExpired(getSession())) signOut();
    };
    check();
    const onActivity = () => touchActivity();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        check();
        touchActivity();
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 5 * 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [signedIn, signOut]);

  const switchWorkspace = useCallback(
    (id: string) => {
      const s = getSession();
      if (s?.signInAs) void endSignInAs(s.signInAs.workspaceId).catch(() => undefined);
      updateSession({ workspaceId: id, impersonating: null, signInAs: null });
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

  const signInAs = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      const s = await startSignInAs(workspaceId, userId);
      updateSession({ signInAs: s });
    },
    [workspaceId],
  );

  const returnToMyAccount = useCallback(async () => {
    const s = getSession()?.signInAs;
    if (!s) return;
    try {
      await endSignInAs(s.workspaceId);
    } finally {
      // Leave locally even if the call failed; the server also ends it after 2 hours.
      updateSession({ signInAs: null });
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session: session ?? null,
      hydrated,
      userId: me?.user.id ?? session?.signInAs?.userId ?? session?.userId ?? null,
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
      signInAs,
      returnToMyAccount,
    }),
    [session, hydrated, me, meQuery.isLoading, meQuery.error, workspaceId, signIn, signOut, switchWorkspace, impersonate, exitImpersonation, signInAs, returnToMyAccount],
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
