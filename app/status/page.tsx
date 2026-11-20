'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, CheckCircle2, Cog, Database, HardDrive, KeyRound, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSystemStatus } from '@/hooks/queries/observability';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useBranding } from '@/lib/theme/BrandingProvider';
import type { ComponentKey, HealthState, SystemStatus } from '@/lib/api/endpoints/observability';
import { formatDate, formatNumber, formatPercent, formatRelative, formatTime } from '@/lib/format';
import { CardSkeleton, ErrorState } from '@/components/crm/states';
import { cn } from '@/lib/utils';

const SpeedChart = dynamic(() => import('@/components/crm/StatusCharts').then((m) => m.SpeedChart), { ssr: false, loading: () => <CardSkeleton className="h-56" /> });
const VolumeChart = dynamic(() => import('@/components/crm/StatusCharts').then((m) => m.VolumeChart), { ssr: false, loading: () => <CardSkeleton className="h-44" /> });

const ICON: Record<ComponentKey, LucideIcon> = { api: Activity, database: Database, auth: KeyRound, storage: HardDrive, jobs: Cog };

const STATE_STYLE: Record<HealthState, { pill: string; icon: LucideIcon; banner: string }> = {
  up: { pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: CheckCircle2, banner: 'from-emerald-800 to-emerald-700' },
  degraded: { pill: 'bg-amber-50 text-amber-900 ring-amber-200', icon: AlertTriangle, banner: 'from-amber-800 to-amber-700' },
  down: { pill: 'bg-red-50 text-red-800 ring-red-200', icon: XCircle, banner: 'from-red-800 to-red-700' },
};

function cellTone(u: number | null): string {
  if (u == null) return 'bg-gray-200';
  if (u >= 0.99) return 'bg-emerald-500';
  if (u >= 0.9) return 'bg-amber-400';
  return 'bg-red-500';
}

function StatePill({ state }: { state: HealthState }) {
  const t = useTranslations('statusPage.state');
  const S = STATE_STYLE[state];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', S.pill)}>
      <S.icon className="size-3.5" aria-hidden="true" />
      {t(state)}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function Uptime({ data }: { data: SystemStatus }) {
  const t = useTranslations('statusPage');
  const s = useWorkspaceSettings();
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card lg:p-5">
      <h2 className="font-heading text-base font-semibold">{t('uptimeTitle')}</h2>
      <div className="mt-4 space-y-5">
        {data.components.map((c) => {
          const days = data.history[c.key] ?? [];
          const known = days.filter((d) => d.uptime != null);
          const avg = known.length ? known.reduce((a, d) => a + (d.uptime ?? 0), 0) / known.length : null;
          return (
            <div key={c.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-gray-900">{t(`component.${c.key}`)}</span>
                <span className="text-xs text-gray-600 tabular-nums">{avg == null ? t('noData') : t('uptimeValue', { value: formatPercent(avg, s, 2) })}</span>
              </div>
              <ul className="flex gap-[2px]">
                {days.map((d) => {
                  const label = t('dayCell', { day: formatDate(d.day, { ...s, timezone: 'UTC' }), value: d.uptime == null ? t('noData') : formatPercent(d.uptime, s, 1) });
                  return <li key={d.day} title={label} aria-label={label} className={cn('h-8 flex-1 rounded-[3px]', cellTone(d.uptime))} />;
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {([['bg-emerald-500', 'legendGood'], ['bg-amber-400', 'legendPartial'], ['bg-red-500', 'legendBad'], ['bg-gray-200', 'legendNone']] as const).map(([tone, key]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('size-2.5 rounded-sm', tone)} />
            {t(key)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StatusPage() {
  const t = useTranslations('statusPage');
  const s = useWorkspaceSettings();
  const { branding } = useBranding();
  const q = useSystemStatus();
  const ms = (v: number) => t('ms', { value: formatNumber(v, s) });

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
          ) : (
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-brand font-heading text-sm font-bold text-on-brand">{branding.logoText.slice(0, 2)}</span>
          )}
          <div>
            <p className="font-heading text-sm font-semibold text-gray-900">{branding.appName}</p>
            <h1 className="text-xs text-gray-600">{t('title')}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {q.isLoading && (
          <>
            <CardSkeleton className="h-28 rounded-2xl" />
            <CardSkeleton className="h-64 rounded-2xl" />
          </>
        )}
        {q.isError && !q.data && <ErrorState title={t('error')} onRetry={() => q.refetch()} />}
        {q.data && <StatusBody data={q.data} ms={ms} />}
      </main>
    </div>
  );
}

function StatusBody({ data, ms }: { data: SystemStatus; ms: (v: number) => string }) {
  const t = useTranslations('statusPage');
  const s = useWorkspaceSettings();
  const S = STATE_STYLE[data.overall];
  const hours = data.api.hourly.map((h) => ({
    hour: h.hour, label: formatTime(h.hour, s), requests: h.requests, errors: h.errors, p50: h.p50_ms, p95: h.p95_ms,
  }));
  return (
    <>
      <section aria-live="polite" className={cn('rounded-2xl bg-gradient-to-br p-5 text-white shadow-card', S.banner)}>
        <div className="flex items-center gap-3">
          <S.icon className="size-8 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-heading text-xl font-bold">{t(`overall.${data.overall}`)}</p>
            <p className="text-sm text-white/85">{t('checked', { time: formatRelative(data.checked_at, s) })}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <h2 className="px-4 pt-4 font-heading text-base font-semibold lg:px-5">{t('components')}</h2>
        <ul className="mt-2 divide-y">
          {data.components.map((c) => {
            const Icon = ICON[c.key];
            return (
              <li key={c.key} className="flex items-center gap-3 px-4 py-3 lg:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{t(`component.${c.key}`)}</p>
                  <p className="truncate text-xs text-gray-600">{t(`componentHint.${c.key}`)}</p>
                </div>
                {c.latency_ms != null && <span className="text-xs tabular-nums text-gray-600">{ms(c.latency_ms)}</span>}
                <StatePill state={c.state} />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('kpiRequests')} value={formatNumber(data.api.requests_24h, s)} />
        <Kpi label={t('kpiErrorRate')} value={formatPercent(data.api.error_rate_24h, s, 2)} />
        <Kpi label={t('kpiP50')} value={data.api.p50_ms == null ? '—' : ms(data.api.p50_ms)} />
        <Kpi label={t('kpiP95')} value={data.api.p95_ms == null ? '—' : ms(data.api.p95_ms)} />
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-card lg:p-5">
        <h2 className="font-heading text-base font-semibold">{t('speedTitle')}</h2>
        <p className="mb-3 text-xs text-gray-600">{t('speedHint')}</p>
        <SpeedChart data={hours} caption={t('speedTitle')} hourCol={t('hourCol')} labels={{ p50: t('p50'), p95: t('p95') }} fmt={ms} axisFmt={(v) => formatNumber(v, s)} />
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card lg:p-5">
        <h2 className="mb-3 font-heading text-base font-semibold">{t('volumeTitle')}</h2>
        <VolumeChart data={hours} caption={t('volumeTitle')} hourCol={t('hourCol')} labels={{ requests: t('requests'), errors: t('errors') }} fmt={(v) => formatNumber(v, s)} />
      </section>

      <Uptime data={data} />
      <p className="text-center text-xs text-gray-500">{t('poweredBy')}</p>
    </>
  );
}
