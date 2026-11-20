'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AuthPage, FormMessage } from '@/components/layout/AuthPage';
import { PasswordInput } from '@/components/crm/PasswordInput';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { setNewPassword } from '@/lib/api/endpoints/auth';
import { useSession } from '@/lib/auth/SessionProvider';

/** New password for a signed-in session (from a reset or invite link). */
export function SetPasswordForm({ mode }: { mode: 'reset' | 'invite' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (hydrated && !session) router.replace('/forgot-password');
  }, [hydrated, session, router]);

  const save = useMutation({
    mutationFn: () => setNewPassword(password),
    meta: { silent: true },
    onSuccess: () => {
      toast.success(t('passwordSaved'));
      router.replace('/home');
    },
  });
  const short = submitted && password.length < 8;

  return (
    <AuthPage title={mode === 'invite' ? t('inviteTitle') : t('resetTitle')} subtitle={mode === 'invite' ? t('inviteSubtitle') : undefined}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          setSubmitted(true);
          if (password.length >= 8) save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t('newPasswordLabel')}</Label>
          <PasswordInput id="new-password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={short || undefined} />
          <p className={short ? 'text-sm text-red-700' : 'text-sm text-gray-600'}>{short ? t('passwordTooShort') : t('passwordHint')}</p>
        </div>
        {save.error && <FormMessage>{(save.error as Error).message}</FormMessage>}
        <Button type="submit" className="h-12 w-full text-base" disabled={save.isPending}>
          {save.isPending ? t('saving') : t('savePassword')}
        </Button>
      </form>
    </AuthPage>
  );
}
