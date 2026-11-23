/**
 * Client session store: token, user, active workspace. Persisted to
 * localStorage; a presence cookie lets middleware redirect signed-out users
 * before the page renders (the cookie holds no secret).
 */

export interface Session {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms; null when the backend doesn't send an expiry (sandbox). */
  expiresAt: number | null;
  userId: string;
  workspaceId: string | null;
  /** Set while a partner admin is viewing a client workspace. */
  impersonating: { workspaceId: string; workspaceName: string; returnTo: string | null } | null;
  /**
   * Set while an owner is signed in as a teammate ("Sign in as"). The owner's
   * own token stays above; requests to this workspace carry the session id.
   */
  signInAs?: SignInAs | null;
  /** epoch ms of the last tap, key press or request; drives the idle sign-out. */
  lastActiveAt?: number | null;
}

export interface SignInAs {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  role: 'manager' | 'agent';
  /** ISO time the server ends it. */
  expiresAt: string;
}

export const SIGN_IN_AS_HEADER = 'x-sign-in-as';

/** Signed out after this long with no activity. Active people stay signed in (tokens refresh). */
export const IDLE_LIMIT_MS = 24 * 3600_000;
const TOUCH_EVERY_MS = 60_000;

export function isIdleExpired(s: Session | null, now = Date.now()): boolean {
  return Boolean(s?.lastActiveAt && now - s.lastActiveAt > IDLE_LIMIT_MS);
}

/** Records activity (at most once a minute; shared across tabs through storage). */
export function touchActivity(now = Date.now()) {
  const s = getSession();
  if (!s || isIdleExpired(s, now)) return;
  if (!s.lastActiveAt || now - s.lastActiveAt > TOUCH_EVERY_MS) setSession({ ...s, lastActiveAt: now });
}

const STORAGE_KEY = 'crm.session.v1';
export const SESSION_COOKIE = 'crm_session';

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Session | null | undefined; // undefined = not loaded yet

function read(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function write(s: Session | null) {
  if (typeof window === 'undefined') return;
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the session lives for this tab only.
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = s
    ? `${SESSION_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
    : `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function getSession(): Session | null {
  if (current === undefined) current = read();
  return current;
}

export function setSession(next: Session | null) {
  current = next;
  write(next);
  listeners.forEach((l) => l());
}

export function updateSession(patch: Partial<Session>) {
  const s = getSession();
  if (s) setSession({ ...s, ...patch });
}

export function clearSession() {
  setSession(null);
}

export function subscribeSession(l: Listener): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = read();
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** The "Sign in as" session id to send with a request to this workspace, if any. */
export function signInAsFor(workspaceId: string | null): string | null {
  const s = getSession()?.signInAs;
  return s && workspaceId && s.workspaceId === workspaceId ? s.id : null;
}

/** The workspace requests are scoped to (impersonated or own). */
export function activeWorkspaceId(): string | null {
  const s = getSession();
  return s?.impersonating?.workspaceId ?? s?.workspaceId ?? null;
}
