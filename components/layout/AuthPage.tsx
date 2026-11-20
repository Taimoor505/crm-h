'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Mail, MessageCircle, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { waLink } from '@/lib/phone';

/** Shared frame for sign-in, sign-up and password pages. */
export function AuthPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTranslations('auth');
  const p = useTranslations('authPanel');
  const { branding } = useBranding();
  return (
    <AuthShell
      panelTitle={branding.tagline || t('welcome', { app: branding.appName })}
      points={[
        { icon: <Zap className="size-5" />, title: p('point1Title'), body: p('point1') },
        { icon: <CalendarCheck className="size-5" />, title: p('point2Title'), body: p('point2') },
        { icon: <TrendingUp className="size-5" />, title: p('point3Title'), body: p('point3') },
      ]}
      footnote={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {p('secure')}
        </span>
      }
    >
      <div className="animate-rise mx-auto w-full max-w-[26rem]">
        <div className="mb-8 space-y-2">
          <h1 className="font-heading text-[28px] font-bold tracking-tight text-gray-900 sm:text-[32px]">{title}</h1>
          {subtitle && <p className="text-base text-gray-600">{subtitle}</p>}
        </div>
        {children}
        {(branding.supportWhatsapp || branding.supportEmail) && (
          <div className="mt-10 border-t pt-6 text-sm text-gray-600">
            <p>{t('needHelp')}</p>
            <div className="mt-1 flex flex-wrap gap-x-5">
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
      </div>
    </AuthShell>
  );
}

/** Inline form error or status line. */
export function FormMessage({ tone = 'error', children }: { tone?: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800' : 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800'}>
      {children}
    </p>
  );
}
