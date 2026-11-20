'use client';

import { Fragment, useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Activity, ChevronDown, Copy, Gauge, Radio, Search, ServerCrash, Timer, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import { useApiLogs } from '@/hooks/queries/observability';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import type { ApiLog, ApiLogFilters, ApiLogSummary } from '@/lib/api/endpoints/observability';
import { formatNumber, formatShortDate, formatTime } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { cn } from '@/lib/utils';

const STATUSES = ['all', 'errors', '2xx', '3xx', '4xx', '5xx'] as const;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const RANGES = [15, 60, 1440, 10080, 20160] as const;

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-800',
  POST: 'bg-emerald-50 text-emerald-800',
  PUT: 'bg-amber-50 text-amber-900',
  PATCH: 'bg-violet-50 text-violet-800',
  DELETE: 'bg-red-50 text-red-800',
};

function statusTone(s: number) {
  if (s >= 500) return 'bg-red-50 text-red-800 ring-red-200';
  if (s >= 400) return 'bg-amber-50 text-amber-900 ring-amber-200';
  if (s >= 300) return 'bg-sky-50 text-sky-800 ring-sky-200';
  return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
}

function durationTone(ms: number) {
  if (ms >= 1000) return 'text-red-700 font-semibold';
  if (ms >= 300) return 'text-amber-800 font-medium';
  return 'text-gray-700';
}

function MethodBadge({ method }: { method: string }) {
  return <span className={cn('inline-block w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold', METHOD_TONE[method] ?? 'bg-gray-100 text-gray-700')}>{method}</span>;
}

function StatusBadge({ status }: { status: number }) {
  return <span className={cn('inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ring-1', statusTone(status))}>{status}</span>;
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-card">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-heading text-xl leading-tight font-bold tabular-nums text-gray-900">{value}</p>
        <p className="truncate text-xs text-gray-600">{label}</p>
        {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

function Summary({ summary, ms }: { summary: ApiLogSummary; ms: (v: number | null) => string }) {
  const t = useTranslations('devLogs');
  const s = useWorkspaceSettings();
  const max = Math.max(1, ...summary.slowest_routes.map((r) => r.p95_ms ?? 0));
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={Activity} tone="bg-brand-surface text-brand-ink" label={t('kpiRequests')} value={formatNumber(summary.requests, s)} sub={t('kpiUsers', { count: summary.users })} />
        <Kpi icon={ServerCrash} tone="bg-red-50 text-red-700" label={t('kpiErrors')} value={formatNumber(summary.server_errors, s)} sub={t('kpiClientErrors', { count: summary.client_errors })} />
        <Kpi icon={Timer} tone="bg-sky-50 text-sky-700" label={t('kpiP50')} value={ms(summary.p50_ms)} />
        <Kpi icon={Gauge} tone="bg-amber-50 text-amber-800" label={t('kpiP95')} value={ms(summary.p95_ms)} />
      </div>
      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">{t('slowRoutes')}</h2>
        {summary.slowest_routes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">{t('slowRoutesEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {summary.slowest_routes.map((r) => (
              <li key={`${r.method} ${r.route}`} className="text-xs">
                <div className="flex items-center gap-2">
                  <MethodBadge method={r.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-gray-800" title={r.route}>{r.route.replace('/api/v1', '')}</span>
                  <span className={cn('tabular-nums', durationTone(r.p95_ms ?? 0))}>{ms(r.p95_ms)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 ps-[4.5rem]">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${Math.max(3, ((r.p95_ms ?? 0) / max) * 100)}%` }} />
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {t('requestsShort', { count: r.requests })}
                    {r.errors > 0 && <> · <span className="text-red-700">{t('errorsShort', { count: r.errors })}</span></>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Details({ log, onFilter }: { log: ApiLog; onFilter: (f: Partial<ApiLogFilters>) => void }) {
  const t = useTranslations('devLogs');
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v).then(() => toast.success(t('copied')));
  };
  const rows: [string, string | null, boolean?][] = [
    [t('requestId'), log.request_id, true],
    [t('fullPath'), log.path, true],
    [t('errorCode'), log.error_code],
    [t('user'), log.user_id ? `${log.user_name ?? ''} ${log.user_email ? `<${log.user_email}>` : ''}`.trim() : t('anonymous')],
    [t('workspace'), log.workspace_name],
    [t('ip'), log.ip],
    [t('region'), log.region],
    [t('userAgent'), log.user_agent],
  ];
  return (
    <div className="space-y-3 bg-gray-50 p-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        {rows.filter(([, v]) => v).map(([k, v, copyable]) => (
          <Fragment key={k}>
            <dt className="text-xs font-medium text-gray-600">{k}</dt>
            <dd className="flex min-w-0 items-start gap-2">
              <span className="min-w-0 font-mono text-xs break-all text-gray-900">{v}</span>
              {copyable && (
                <button type="button" onClick={() => copy(v!)} aria-label={`${t('copy')}: ${k}`} className="grid size-7 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-200">
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {log.user_id && <Button size="sm" variant="outline" onClick={() => onFilter({ user_id: log.user_id! })}>{t('filterUser')}</Button>}
        {log.workspace_id && <Button size="sm" variant="outline" onClick={() => onFilter({ workspace_id: log.workspace_id! })}>{t('filterWorkspace')}</Button>}
      </div>
    </div>
  );
}

function LogRow({ log, open, onToggle, onFilter, ms }: { log: ApiLog; open: boolean; onToggle: () => void; onFilter: (f: Partial<ApiLogFilters>) => void; ms: (v: number | null) => string }) {
  const t = useTranslations('devLogs');
  const s = useWorkspaceSettings();
  return (
    <li className={cn(log.status >= 500 && 'bg-red-50/40')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={t('showDetails', { method: log.method, path: log.path })}
        className="grid w-full min-h-12 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-start hover:bg-gray-50 lg:grid-cols-[7.5rem_minmax(0,1fr)_4.5rem_5.5rem_13rem_1.25rem]"
      >
        <span className="text-xs tabular-nums text-gray-600 max-lg:order-2 max-lg:col-span-3">
          {formatShortDate(log.at, s)} {formatTime(log.at, s, { seconds: true })}
        </span>
        <span className="flex min-w-0 items-center gap-2 max-lg:col-span-2">
          <MethodBadge method={log.method} />
          <span className="truncate font-mono text-xs text-gray-900" title={log.path}>{log.path.replace('/api/v1', '')}</span>
        </span>
        <span><StatusBadge status={log.status} /></span>
        <span className={cn('text-xs tabular-nums max-lg:hidden', durationTone(log.duration_ms))}>{ms(log.duration_ms)}</span>
        <span className="min-w-0 truncate text-xs text-gray-700 max-lg:hidden">
          {log.user_name ?? log.user_email ?? <span className="text-gray-500">{t('anonymous')}</span>}
          {log.workspace_name && <span className="text-gray-500"> · {log.workspace_name}</span>}
        </span>
        <ChevronDown className={cn('size-4 text-gray-400 transition-transform max-lg:hidden', open && 'rotate-180')} aria-hidden="true" />
        <span className={cn('text-xs tabular-nums lg:hidden', durationTone(log.duration_ms))}>{ms(log.duration_ms)}</span>
      </button>
      {open && <Details log={log} onFilter={onFilter} />}
    </li>
  );
}

const selectCls = 'h-11 rounded-[10px] border bg-white px-3 text-sm text-gray-900 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none';

export default function ApiLogsPage() {
  const t = useTranslations('devLogs');
  const a = useTranslations('admin');
  const s = useWorkspaceSettings();
  const { can } = usePermissions();
  const router = useRouter();
  const allowed = can('dev.logs');
  useEffect(() => {
    if (!allowed) router.replace('/home');
  }, [allowed, router]);

  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [filters, setFilters] = useState<Omit<ApiLogFilters, 'q'>>({ status: 'all', minutes: 1440 });
  const [live, setLive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const logs = useApiLogs({ ...filters, q }, live && allowed);
  const ms = (v: number | null) => (v == null ? '—' : t('ms', { value: formatNumber(v, s) }));
  const set = (patch: Partial<ApiLogFilters>) => setFilters((f) => ({ ...f, ...patch }));

  if (!allowed) return null;
  const pages = logs.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.data);
  const summary = pages[0]?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-3">
            <Link href="/status" className="text-sm font-semibold text-brand-ink underline-offset-4 hover:underline">{a('statusPage')}</Link>
            <label className="flex min-h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium" title={t('liveHint')}>
              <Radio className={cn('size-4', live ? 'animate-pulse text-emerald-600' : 'text-gray-400')} aria-hidden="true" />
              {t('live')}
              <Switch checked={live} onCheckedChange={setLive} aria-label={t('liveHint')} />
            </label>
          </div>
        }
      />

      {summary ? <Summary summary={summary} ms={ms} /> : logs.isLoading && <CardSkeleton className="h-40 rounded-2xl" />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('searchLabel')} className="h-11 ps-9" />
        </div>
        <select aria-label={t('statusLabel')} className={selectCls} value={filters.status} onChange={(e) => set({ status: e.target.value as ApiLogFilters['status'] })}>
          {STATUSES.map((x) => <option key={x} value={x}>{t(`statusOpt.${x}`)}</option>)}
        </select>
        <select aria-label={t('methodLabel')} className={selectCls} value={filters.method ?? ''} onChange={(e) => set({ method: e.target.value || undefined })}>
          <option value="">{t('anyMethod')}</option>
          {METHODS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select aria-label={t('rangeLabel')} className={selectCls} value={filters.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
          {RANGES.map((x) => <option key={x} value={x}>{t(`range.${x}`)}</option>)}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-[10px] border bg-white px-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand-primary)]" checked={Boolean(filters.slow)} onChange={(e) => set({ slow: e.target.checked || undefined })} />
          {t('slowOnly')}
        </label>
        {(filters.user_id || filters.workspace_id) && (
          <Button variant="ghost" className="min-h-11" onClick={() => set({ user_id: undefined, workspace_id: undefined })}>
            <X className="size-4" aria-hidden="true" />
            {filters.user_id ? t('filterUser') : t('filterWorkspace')}
          </Button>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_4.5rem_5.5rem_13rem_1.25rem] gap-x-3 border-b bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 lg:grid">
          <span>{t('colTime')}</span>
          <span>{t('colRequest')}</span>
          <span>{t('colStatus')}</span>
          <span>{t('colDuration')}</span>
          <span>{t('colWho')}</span>
          <span />
        </div>
        {logs.isLoading ? (
          <ListSkeleton rows={8} className="p-4" />
        ) : logs.isError && !rows.length ? (
          <ErrorState onRetry={() => logs.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title={t('empty')} body={t('emptyHint')} />
        ) : (
          <ul className="divide-y">
            {rows.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                open={openId === log.id}
                onToggle={() => setOpenId((o) => (o === log.id ? null : log.id))}
                onFilter={set}
                ms={ms}
              />
            ))}
          </ul>
        )}
      </section>

      {logs.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-11" disabled={logs.isFetchingNextPage} onClick={() => logs.fetchNextPage()}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
