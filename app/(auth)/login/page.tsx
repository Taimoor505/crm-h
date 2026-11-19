'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput, toPhoneValue, type PhoneValue } from '@/components/crm/PhoneInput';
import { sendOtp, verifyOtp } from '@/lib/api/endpoints/auth';
import { isApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/SessionProvider';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { formatPhone, isCountryCode, waLink } from '@/lib/phone';
import { isDevToolsEnabled } from '@/lib/dev-tools';

const RESEND_SECONDS = 30;

function guessCountry(): string {
  if (typeof navigator === 'undefined') return 'US';
  const region = navigator.language.split('-')[1];
  return isCountryCode(region) ? region.toUpperCase() : 'US';
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const t = useTranslations('auth');
  const e = useTranslations('errors');
  const { branding } = useBranding();
  const { session, hydrated, signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';

  const [phone, setPhone] = useState<PhoneValue>(() => toPhoneValue('', 'US'));
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [submitted, setSubmitted] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => setPhone(toPhoneValue('', guessCountry())), []);

  // Already signed in: go straight on.
  useEffect(() => {
    if (hydrated && session) router.replace(safeNext);
  }, [hydrated, session, router, safeNext]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const send = useMutation({
    mutationFn: (e164: string) => sendOtp(e164),
    meta: { silent: true },
    onSuccess: (r) => {
      setStep('code');
      setResendIn(RESEND_SECONDS);
      setDevCode(isDevToolsEnabled() ? r.debug_code : null);
    },
  });

  const verify = useMutation({
    mutationFn: (code: string) => verifyOtp(phone.e164!, code),
    meta: { silent: true },
    onSuccess: (r) => {
      signIn(r);
      // The app gate sends people without a workspace to onboarding (or partners to /partner).
      router.replace(safeNext);
    },
  });

  const phoneError = submitted && !phone.e164 ? e('invalidPhone') : null;
  const sendError = send.error ? (isApiError(send.error) && send.error.status === 429 ? t('tooMany') : send.error.message) : null;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background sm:justify-center">
      {/* Soft brand glow behind the card (brand color only, via variables). */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 start-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand opacity-[0.12] blur-3xl rtl:translate-x-1/2" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -end-32 size-[28rem] rounded-full bg-brand-accent opacity-[0.10] blur-3xl" />
      <main className="animate-rise relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:my-12 sm:flex-none sm:rounded-[28px] sm:bg-card sm:px-10 sm:py-12 sm:shadow-float">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="size-14 rounded-2xl object-contain" />
          ) : (
            <span aria-hidden="true" className="grid size-16 place-items-center rounded-[20px] bg-brand font-heading text-2xl font-bold text-on-brand shadow-raised">
              {branding.logoText.slice(0, 2)}
            </span>
          )}
          <h1 className="font-heading text-[26px] font-bold tracking-tight text-gray-900">{t('welcome', { app: branding.appName })}</h1>
          {branding.tagline && <p className="text-sm text-gray-600">{branding.tagline}</p>}
        </div>

        {step === 'phone' ? (
          <form
            noValidate
            onSubmit={(ev) => {
              ev.preventDefault();
              setSubmitted(true);
              if (phone.e164) send.mutate(phone.e164);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="login-phone">{t('phoneLabel')}</Label>
              <PhoneInput id="login-phone" autoFocus value={phone} onChange={setPhone} invalid={!!phoneError} describedBy="login-phone-hint" />
              <p id="login-phone-hint" className={phoneError || sendError ? 'text-sm text-red-700' : 'text-sm text-gray-600'} role={phoneError || sendError ? 'alert' : undefined}>
                {phoneError ?? sendError ?? t('phoneHint')}
              </p>
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={send.isPending}>
              {send.isPending ? t('sending') : t('sendCode')}
            </Button>
          </form>
        ) : (
          <CodeStep
            phoneLabel={formatPhone(phone.e164, 'international')}
            devCode={devCode}
            verifying={verify.isPending}
            error={verify.error ? (isApiError(verify.error) && verify.error.status === 429 ? t('tooMany') : t('invalidCode')) : null}
            resendIn={resendIn}
            onResend={() => phone.e164 && send.mutate(phone.e164)}
            onBack={() => {
              setStep('phone');
              verify.reset();
            }}
            onSubmit={(code) => verify.mutate(code)}
          />
        )}

        {(branding.supportWhatsapp || branding.supportEmail) && (
          <div className="mt-10 text-center text-sm text-gray-600">
            <p>{t('needHelp')}</p>
            <div className="mt-2 flex justify-center gap-4">
              {branding.supportWhatsapp && (
                <a href={waLink(branding.supportWhatsapp)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-ink hover:underline">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {t('whatsapp')}
                </a>
              )}
              {branding.supportEmail && (
                <a href={`mailto:${branding.supportEmail}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-ink hover:underline">
                  <Mail className="size-4" aria-hidden="true" />
                  {branding.supportEmail}
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function CodeStep({
  phoneLabel, devCode, verifying, error, resendIn, onResend, onBack, onSubmit,
}: {
  phoneLabel: string;
  devCode: string | null;
  verifying: boolean;
  error: string | null;
  resendIn: number;
  onResend: () => void;
  onBack: () => void;
  onSubmit: (code: string) => void;
}) {
  const t = useTranslations('auth');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => refs.current[0]?.focus(), []);

  function setAt(i: number, value: string) {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      // Paste or SMS autofill of the whole code.
      const all = clean.slice(0, 6).split('');
      const next = Array(6).fill('').map((_, k) => all[k] ?? '');
      setDigits(next);
      refs.current[Math.min(all.length, 5)]?.focus();
      if (all.length === 6) onSubmit(all.join(''));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) onSubmit(next.join(''));
  }

  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        if (digits.every(Boolean)) onSubmit(digits.join(''));
      }}
      className="space-y-5"
    >
      <div>
        <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t('changeNumber')}
        </button>
        <h2 className="font-heading text-lg font-semibold">{t('codeTitle')}</h2>
        <p className="text-sm text-gray-600">{t('codeSent', { phone: phoneLabel })}</p>
      </div>
      <fieldset>
        <legend className="sr-only">{t('codeLabel')}</legend>
        <div className="flex justify-between gap-2" dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={d}
              onChange={(ev) => setAt(i, ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={i === 0 ? 6 : 1}
              aria-label={t('digit', { n: i + 1 })}
              aria-invalid={!!error || undefined}
              className="h-14 w-full min-w-0 rounded-lg border border-input bg-white text-center font-heading text-2xl font-semibold tabular-nums focus:border-brand"
            />
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {devCode && <p className="rounded-md bg-gray-100 px-3 py-2 text-center font-mono text-xs text-gray-700">{t('devCode', { code: devCode })}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={verifying || !digits.every(Boolean)}>
        {verifying ? t('verifying') : t('verify')}
      </Button>
      <div className="text-center">
        {resendIn > 0 ? (
          <p className="text-sm text-gray-600 tabular-nums">{t('resendIn', { seconds: resendIn })}</p>
        ) : (
          <button type="button" onClick={onResend} className="min-h-10 text-sm font-medium text-brand-ink hover:underline">
            {t('resend')}
          </button>
        )}
      </div>
    </form>
  );
}
