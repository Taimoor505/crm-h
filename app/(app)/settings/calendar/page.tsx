'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck2, CalendarDays, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ErrorState, PageSkeleton } from '@/components/crm/states';
import { useConnectGoogle, useDisconnectGoogle, useGoogleCalendar } from '@/hooks/queries/integrations';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

const FLASH = ['connected', 'denied', 'no_refresh', 'error'] as const;
type Flash = (typeof FLASH)[number];

function FlashBanner() {
  const t = useTranslations('settings.calendar.flash');
  const raw = useSearchParams().get('google');
  if (!raw || !FLASH.includes(raw as Flash)) return null;
  const ok = raw === 'connected';
  const Icon = ok ? CheckCircle2 : TriangleAlert;
  return (
    <p role="status" className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t(raw as Flash)}
    </p>
  );
}

export default function CalendarSettingsPage() {
  const t = useTranslations('settings.calendar');
  const n = useTranslations('settings');
  const c = useTranslations('common');
  const s = useWorkspaceSettings();
  const q = useGoogleCalendar();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const [confirming, setConfirming] = useState(false);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const g = q.data;
  const how = [t('how1'), t('how2'), t('how3'), t('how4')];

  return (
    <SettingsPage title={n('nav.calendar')} description={t('intro')}>
      <Suspense fallback={null}>
        <FlashBanner />
      </Suspense>

      <SettingsCard>
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', g.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-surface text-brand-ink')}
            aria-hidden="true"
          >
            {g.connected ? <CalendarCheck2 className="size-6" /> : <CalendarDays className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-semibold text-gray-900">
              {g.connected ? (g.email ? t('connectedAs', { email: g.email }) : t('connectedNoEmail')) : n('nav.calendar')}
            </p>
            {g.connected ? (
              <p className="text-sm text-gray-600">
                {t('syncedCount', { count: g.synced_count })}
                {g.last_synced_at && <> · {t('lastSynced', { time: formatRelative(g.last_synced_at, s) })}</>}
              </p>
            ) : (
              <p className="text-sm text-gray-600">{n('hints.calendar')}</p>
            )}
          </div>
          {g.configured && !g.connected && (
            <Button className="min-h-11" disabled={connect.isPending} onClick={() => connect.mutate(undefined, { onError: () => toast.error(t('flash.error')) })}>
              {connect.isPending ? t('connecting') : t('connect')}
            </Button>
          )}
          {g.connected && !confirming && (
            <Button variant="outline" className="min-h-11" onClick={() => setConfirming(true)}>
              {t('disconnect')}
            </Button>
          )}
        </div>

        {confirming && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="min-w-0 flex-1">{t('disconnectConfirm')}</p>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirming(false)}>
              {c('cancel')}
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(t('disconnected'));
                  },
                })
              }
            >
              {t('disconnect')}
            </Button>
          </div>
        )}

        {g.connected && g.last_error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('lastError')}
          </p>
        )}
        {!g.configured && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('notConfigured')}
          </p>
        )}
      </SettingsCard>

      <SettingsCard>
        <ul className="space-y-2.5">
          {how.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-gray-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-600">{t('privacy')}</p>
      </SettingsCard>
    </SettingsPage>
  );
}
