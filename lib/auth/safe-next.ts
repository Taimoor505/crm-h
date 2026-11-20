/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
