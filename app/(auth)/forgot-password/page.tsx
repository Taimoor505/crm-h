'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AuthPage, FormMessage } from '@/components/layout/AuthPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/lib/api/endpoints/auth';
import { isApiError } from '@/lib/api/client';
import { EMAIL_RE } from '@/lib/auth/safe-next';

export default function ForgotPage() {
  return (
    <Suspense>
      <Forgot />
    </Suspense>
  );
}

function Forgot() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState(useSearchParams().get('email') ?? '');
  const [submitted, setSubmitted] = useState(false);
  const send = useMutation({ mutationFn: () => requestPasswordReset(email.trim()), meta: { silent: true } });
  const invalid = submitted && !EMAIL_RE.test(email.trim());

  return (
    <AuthPage title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          setSubmitted(true);
          if (EMAIL_RE.test(email.trim())) send.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input id="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email}
            onChange={(e) => setEmail(e.target.value)} aria-invalid={invalid || undefined} className="h-12" />
          {invalid && <p className="text-sm text-red-700">{t('invalidEmail')}</p>}
        </div>
        {send.isSuccess && <FormMessage tone="ok">{t('forgotSent', { email: email.trim() })}</FormMessage>}
        {send.error && <FormMessage>{isApiError(send.error) && send.error.code === 'rate_limited' ? t('tooMany') : (send.error as Error).message}</FormMessage>}
        <Button type="submit" className="h-12 w-full text-base" disabled={send.isPending}>
          {send.isPending ? t('sending') : t('sendLink')}
        </Button>
        <Link href="/login" className="flex min-h-11 items-center justify-center text-sm font-semibold text-brand-ink hover:underline">
          {t('backToSignIn')}
        </Link>
      </form>
    </AuthPage>
  );
}
