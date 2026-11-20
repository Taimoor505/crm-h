'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { AuthPage, FormMessage } from '@/components/layout/AuthPage';
import { useSession } from '@/lib/auth/SessionProvider';
import { safeNext } from '@/lib/auth/safe-next';

function subject(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(part)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

type Outcome =
  | { kind: 'error'; message: 'linkExpired' | 'linkInvalid' }
  | { kind: 'ok'; access: string; refresh: string | null; userId: string; expiresAt: number; type: string | null; next: string | null };

/** Supabase puts the session (or an error) in the URL fragment, which never reaches a server. */
function readOutcome(): Outcome {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  const err = hash.get('error_code') ?? hash.get('error') ?? search.get('error_code') ?? search.get('error');
  if (err) return { kind: 'error', message: /expired|otp/i.test(err) ? 'linkExpired' : 'linkInvalid' };
  const access = hash.get('access_token');
  const userId = access ? subject(access) : null;
  if (!access || !userId) return { kind: 'error', message: 'linkInvalid' };
  const expiresAt = Number(hash.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') ?? 3600);
  return { kind: 'ok', access, refresh: hash.get('refresh_token'), userId, expiresAt, type: hash.get('type'), next: search.get('next') };
}

/** Lands here from links in auth emails (confirm sign-up, reset password, invite). */
export function AuthCallback() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { signIn } = useSession();
  // Read once, on the client only (the fragment doesn't exist on the server).
  const [outcome] = useState<Outcome | null>(() => (typeof window === 'undefined' ? null : readOutcome()));

  useEffect(() => {
    // Clear tokens from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!outcome || outcome.kind === 'error') return;
    signIn({ access_token: outcome.access, refresh_token: outcome.refresh, expires_at: outcome.expiresAt * 1000, user_id: outcome.userId, memberships: [] });
    if (outcome.type === 'recovery') router.replace('/reset-password');
    else if (outcome.type === 'invite') router.replace('/set-password');
    else router.replace(safeNext(outcome.next));
  }, [outcome, router, signIn]);

  const error = outcome?.kind === 'error' ? t(outcome.message) : null;
  return (
    <AuthPage title={error ? t('linkInvalid') : t('callbackWorking')}>
      {error ? (
        <div className="space-y-4">
          <FormMessage>{error}</FormMessage>
          <Link href="/forgot-password" className="flex min-h-11 items-center font-semibold text-brand-ink hover:underline">{t('sendLink')}</Link>
          <Link href="/login" className="flex min-h-11 items-center font-semibold text-brand-ink hover:underline">{t('backToSignIn')}</Link>
        </div>
      ) : (
        <Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />
      )}
    </AuthPage>
  );
}
