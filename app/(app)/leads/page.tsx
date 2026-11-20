'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, Filter, Search, Tag, UserCheck, Columns3, X, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContacts, useMemberNames, useMembers, usePipelines } from '@/hooks/queries/crm';
import { useReport } from '@/hooks/queries/work';
import { qk } from '@/hooks/queries/keys';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { assignContact, createDeal, exportCsv, updateContact, type ContactFilters } from '@/lib/api/endpoints/crm';
import { runBulk } from '@/lib/bulk';
import { dayKey } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import type { Contact } from '@/lib/api/types';
import { SavedViewsBar } from '@/components/crm/SavedViews';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, OwnerAvatar, SourceBadge, StatusBadge } from '@/components/crm/badges';
import { RelativeTime } from '@/components/crm/values';
import { PhoneText } from '@/components/crm/PhoneText';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { Chip } from '@/components/crm/DuePicker';
import { cn, downloadText, humanize, toCsv } from '@/lib/utils';

const STATUSES = ['new', 'contacted', 'qualified', 'hot', 'cold'] as const;

export default function LeadsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Leads />
    </Suspense>
  );
}

function useUrlFilters(): [ContactFilters, (patch: Partial<ContactFilters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters: ContactFilters = {
    q: params.get('q') ?? undefined,
    source: params.get('source') ?? undefined,
    status: params.get('status') ?? undefined,
    owner: params.get('owner') ?? undefined,
    tag: params.get('tag') ?? undefined,
    created_within_days: params.get('created_within_days') ?? undefined,
    awaiting: params.get('awaiting') ?? undefined,
  };
  const set = (patch: Partial<ContactFilters>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return [filters, set];
}

function Leads() {
  const t = useTranslations('leads');
  const c = useTranslations('common');
  const s = useWorkspaceSettings();
  const { can, canWrite } = usePermissions();
  const [filters, setFilters] = useUrlFilters();
  const [search, setSearch] = useState(filters.q ?? '');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ownerName = useMemberNames();

  // Debounced search into the URL.
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) setFilters({ q: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const q = useContacts(filters);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total;

  // Source chips from the last 90 days of leads (agents get their own).
  const from = dayKey(new Date(Date.now() - 90 * 86400_000), s.timezone);
  const sources = useReport('sources', { from });
  const sourceChips = (sources.data?.by_source ?? []).slice(0, 8).map((x) => x.source);

  const activeCount = [filters.status, filters.owner, filters.tag, filters.created_within_days, filters.awaiting].filter(Boolean).length;
  const hasFilters = Boolean(filters.q || filters.source || activeCount);
  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={total !== undefined ? t('count', { count: total }) : undefined}
        actions={
          <>
            {can('leads.export') && !selecting && <ExportAllButton />}
            {can('leads.bulk') && (
              <Button
                variant={selecting ? 'secondary' : 'outline'}
                className="h-10"
                onClick={() => {
                  setSelecting((v) => !v);
                  setSelected(new Set());
                }}
              >
                {selecting ? t('cancelSelect') : t('selectMode')}
              </Button>
            )}
          </>
        }
      />

      <div className="sticky top-14 z-20 -mx-4 space-y-3 bg-background/95 px-4 pt-1 pb-3 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <Input
              type="search"
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 bg-white ps-9"
            />
          </div>
          <Button variant="outline" className="relative h-11 bg-white" onClick={() => setFilterOpen(true)}>
            <Filter className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{c('filters')}</span>
            {activeCount > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-on-brand" aria-label={t('activeFilters', { count: activeCount })}>
                {activeCount}
              </span>
            )}
          </Button>
        </div>
        <SavedViewsBar
          filters={filters}
          onApply={(f) => {
            setSearch(f.q ?? '');
            setFilters(f);
          }}
        />
        {sourceChips.length > 0 && (
          <div role="group" aria-label={t('sourceFilter')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <Chip selected={!filters.source} onClick={() => setFilters({ source: undefined })} className="shrink-0">
              {t('allSources')}
            </Chip>
            {sourceChips.map((src) => (
              <Chip key={src} selected={filters.source === src} onClick={() => setFilters({ source: filters.source === src ? undefined : src })} className="shrink-0">
                {humanize(src)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {q.isLoading ? (
          <ListSkeleton rows={8} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title={t('noMatches')}
              body={t('noMatchesBody')}
              action={
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setSearch('');
                    setFilters({ q: undefined, source: undefined, status: undefined, owner: undefined, tag: undefined, created_within_days: undefined, awaiting: undefined });
                  }}
                >
                  {c('clearAll')}
                </Button>
              }
            />
          ) : (
            <EmptyState title={t('empty')} body={t('emptyBody')} />
          )
        ) : (
          <VirtualList
            rows={rows}
            selecting={selecting}
            selected={selected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            ownerName={ownerName}
            showOwner={can('leads.view_all')}
            hasMore={Boolean(q.hasNextPage)}
            loadingMore={q.isFetchingNextPage}
            onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          />
        )}
      </div>

      {selecting && selected.size > 0 && canWrite && <BulkBar rows={selectedRows} onDone={() => setSelected(new Set())} />}

      <FilterSheet open={filterOpen} onOpenChange={setFilterOpen} filters={filters} onApply={(f) => setFilters(f)} />
      <p className="sr-only" aria-live="polite">
        {total !== undefined ? t('count', { count: total }) : ''}
      </p>
    </div>
  );
}

const LEAD_COLS = 'grid-cols-[minmax(0,2.6fr)_7rem_minmax(0,1fr)_minmax(0,1.3fr)_7rem_6rem]';

function VirtualList({
  rows, selecting, selected, onToggle, ownerName, showOwner, hasMore, loadingMore, onEndReached,
}: {
  rows: Contact[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  ownerName: (id: string | null | undefined) => string | null;
  showOwner: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onEndReached: () => void;
}) {
  const t = useTranslations('leads');
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(listRef.current?.offsetTop ?? 0), []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length + (hasMore ? 1 : 0),
    estimateSize: () => 72,
    overscan: 8,
    scrollMargin: offset,
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = items[items.length - 1];
    if (last && last.index >= rows.length - 10) onEndReached();
  }, [items, rows.length, onEndReached]);

  return (
    <div ref={listRef}>
      <div aria-hidden="true" className={cn('hidden items-center gap-4 border-b bg-gray-50/80 px-5 py-2.5 text-xs font-semibold tracking-wide text-gray-600 uppercase lg:grid', selecting && 'ps-14', LEAD_COLS)}>
        <span>{t('colLead')}</span>
        <span>{t('colStatus')}</span>
        <span>{t('colSource')}</span>
        <span>{showOwner ? t('colOwner') : ''}</span>
        <span>{t('colActivity')}</span>
        <span className="text-end">{t('colAdded')}</span>
      </div>
      <ul role="list" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((item) => {
          const c = rows[item.index];
          return (
            <li
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 border-b border-gray-100"
              style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
            >
              {c ? (
                <div className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 lg:px-5', selected.has(c.id) && 'bg-brand-surface/60')}>
                  {selecting && (
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => onToggle(c.id)} aria-label={t('selectLead', { name: c.name })} className="size-5" />
                  )}
                  <Link
                    href={`/contacts/${c.id}`}
                    onClick={(e) => {
                      if (selecting) {
                        e.preventDefault();
                        onToggle(c.id);
                      }
                    }}
                    className="group flex min-w-0 flex-1 items-center gap-3"
                  >
                    {/* Phone: stacked row */}
                    <div className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
                      <Avatar name={c.name} seed={c.id} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                          <StatusBadge status={c.status} className="shrink-0" />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-600">
                          <PhoneText e164={c.phone_e164} className="truncate" />
                          <SourceBadge source={c.source} className="hidden shrink-0 sm:inline-flex" />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <RelativeTime iso={c.created_at} className="text-xs text-gray-500" />
                        {showOwner && <OwnerAvatar userId={c.owner_id} name={ownerName(c.owner_id)} />}
                      </div>
                    </div>
                    {/* Desktop: table columns */}
                    <div className={cn('hidden min-w-0 flex-1 items-center gap-4 lg:grid', LEAD_COLS)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.name} seed={c.id} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-ink">{c.name}</p>
                          <PhoneText e164={c.phone_e164} className="block truncate text-xs text-gray-600" />
                        </div>
                      </div>
                      <div><StatusBadge status={c.status} /></div>
                      <div className="min-w-0"><SourceBadge source={c.source} /></div>
                      <div className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                        {showOwner ? (
                          <>
                            <OwnerAvatar userId={c.owner_id} name={ownerName(c.owner_id)} />
                            <span className="truncate">{ownerName(c.owner_id) ?? t('unassigned')}</span>
                          </>
                        ) : null}
                      </div>
                      <RelativeTime iso={c.last_activity_at ?? c.updated_at} className="text-sm text-gray-600" />
                      <RelativeTime iso={c.created_at} className="text-end text-sm text-gray-500" />
                    </div>
                  </Link>
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-gray-500">{loadingMore ? t('loadingMore') : ''}</p>
              )}
            </li>
          );
        })}
      </ul>
      {!hasMore && rows.length > 20 && <p className="py-4 text-center text-xs text-gray-500">{t('end')}</p>}
    </div>
  );
}

function FilterSheet({ open, onOpenChange, filters, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; filters: ContactFilters; onApply: (f: Partial<ContactFilters>) => void }) {
  const t = useTranslations('leads');
  const c = useTranslations('common');
  const st = useTranslations('contactStatus');
  const { can } = usePermissions();
  const members = useMembers();
  const [status, setStatus] = useState(filters.status ?? '');
  const [owner, setOwner] = useState(filters.owner ?? '');
  const [tag, setTag] = useState(filters.tag ?? '');

  useEffect(() => {
    if (open) {
      setStatus(filters.status ?? '');
      setOwner(filters.owner ?? '');
      setTag(filters.tag ?? '');
    }
  }, [open, filters.status, filters.owner, filters.tag]);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('filtersTitle')}
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => {
              onApply({ status: undefined, owner: undefined, tag: undefined });
              onOpenChange(false);
            }}
          >
            {c('clear')}
          </Button>
          <Button
            className="h-11 flex-1"
            onClick={() => {
              onApply({ status: status || undefined, owner: owner || undefined, tag: tag.trim() || undefined });
              onOpenChange(false);
            }}
          >
            {c('apply')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('status')}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={!status} onClick={() => setStatus('')}>
              {t('anyStatus')}
            </Chip>
            {STATUSES.map((x) => (
              <Chip key={x} selected={status === x} onClick={() => setStatus(x)}>
                {st(x)}
              </Chip>
            ))}
          </div>
        </fieldset>
        {can('leads.view_all') && (
          <div className="space-y-1.5">
            <Label htmlFor="f-owner">{t('owner')}</Label>
            <Select value={owner || 'any'} onValueChange={(v) => setOwner(v === 'any' ? '' : v)}>
              <SelectTrigger id="f-owner" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t('anyOwner')}</SelectItem>
                <SelectItem value="none">{t('noOwner')}</SelectItem>
                {(members.data ?? []).map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="f-tag">{t('tag')}</Label>
          <Input id="f-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t('tagPlaceholder')} className="h-11" />
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function ExportAllButton() {
  const t = useTranslations('leads');
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="h-10"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await exportCsv('contacts');
          downloadText(r.file_name, r.csv);
          toast.success(t('exported', { count: r.row_count }));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{t('exportAll')}</span>
    </Button>
  );
}

type BulkAction = 'assign' | 'tag' | 'pipeline' | 'status' | null;

function BulkBar({ rows, onDone }: { rows: Contact[]; onDone: () => void }) {
  const t = useTranslations('leads');
  const c = useTranslations('common');
  const { can } = usePermissions();
  const s = useWorkspaceSettings();
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const members = useMembers();
  const pipelines = usePipelines();
  const [action, setAction] = useState<BulkAction>(null);
  const [assignee, setAssignee] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const st = useTranslations('contactStatus');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [busy, setBusy] = useState(false);
  const pipeline = pipelines.data?.find((p) => p.id === (pipelineId || pipelines.data?.[0]?.id));

  async function run(fn: (c: Contact) => Promise<unknown>) {
    setBusy(true);
    const r = await runBulk(rows, fn);
    setBusy(false);
    setAction(null);
    qc.invalidateQueries({ queryKey: qk.contacts(ws) });
    qc.invalidateQueries({ queryKey: qk.deals(ws) });
    if (r.failed) toast.error(t('bulkPartial', { ok: r.ok, total: rows.length }));
    else toast.success(t('bulkDone', { count: r.ok }));
    onDone();
  }

  const btn = 'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium text-gray-800 hover:bg-gray-100';

  return (
    <>
      <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-1 rounded-xl border bg-white p-1.5 shadow-float lg:bottom-6">
        <p className="px-2 text-sm font-semibold whitespace-nowrap tabular-nums">{c('selected', { count: rows.length })}</p>
        {can('leads.assign') && (
          <button type="button" className={btn} onClick={() => setAction('assign')}>
            <UserCheck className="size-4" aria-hidden="true" />
            {t('bulkAssign')}
          </button>
        )}
        <button type="button" className={btn} onClick={() => setAction('tag')}>
          <Tag className="size-4" aria-hidden="true" />
          {t('bulkTag')}
        </button>
        <button type="button" className={btn} onClick={() => setAction('status')}>
          <CircleDot className="size-4" aria-hidden="true" />
          {t('bulkStatus')}
        </button>
        <button type="button" className={btn} onClick={() => setAction('pipeline')}>
          <Columns3 className="size-4" aria-hidden="true" />
          {t('bulkPipeline')}
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            const csv = toCsv([
              ['name', 'phone', 'email', 'source', 'status', 'tags', 'created_at'],
              ...rows.map((r) => [r.name, formatPhone(r.phone_e164, 'international'), r.email, r.source, r.status, r.tags.join('|'), r.created_at]),
            ]);
            downloadText('leads.csv', csv);
            toast.success(t('exported', { count: rows.length }));
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {t('bulkExport')}
        </button>
        <button type="button" aria-label={c('clear')} onClick={onDone} className="grid size-10 place-items-center rounded-lg text-gray-600 hover:bg-gray-100">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <ResponsiveSheet
        open={action === 'assign'}
        onOpenChange={(o) => !o && setAction(null)}
        title={t('assignTitle', { count: rows.length })}
        footer={
          <Button className="h-11 w-full" disabled={busy || !assignee} onClick={() => run((r) => assignContact(r.id, assignee === 'none' ? null : assignee))}>
            {c('apply')}
          </Button>
        }
      >
        <Label htmlFor="bulk-assign">{t('assignTo')}</Label>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger id="bulk-assign" className="mt-1.5 h-11 w-full">
            <SelectValue placeholder={c('select')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{c('unassigned')}</SelectItem>
            {(members.data ?? []).filter((m) => m.status === 'active').map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={action === 'status'}
        onOpenChange={(o) => !o && setAction(null)}
        title={t('statusTitle', { count: rows.length })}
        footer={
          <Button className="h-11 w-full" disabled={busy || !status} onClick={() => run((r) => updateContact(r.id, { status }))}>
            {c('apply')}
          </Button>
        }
      >
        <Label htmlFor="bulk-status">{t('statusLabel')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="bulk-status" className="mt-1.5 h-11 w-full">
            <SelectValue placeholder={c('select')} />
          </SelectTrigger>
          <SelectContent>
            {([...STATUSES, 'won', 'lost'] as const).map((x) => (
              <SelectItem key={x} value={x}>
                {st(x)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={action === 'tag'}
        onOpenChange={(o) => !o && setAction(null)}
        title={t('tagTitle', { count: rows.length })}
        footer={
          <Button className="h-11 w-full" disabled={busy || !tag.trim()} onClick={() => run((r) => updateContact(r.id, { tags: Array.from(new Set([...r.tags, tag.trim()])) }))}>
            {c('apply')}
          </Button>
        }
      >
        <Label htmlFor="bulk-tag">{t('tagLabel')}</Label>
        <Input id="bulk-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t('tagPlaceholder')} className="mt-1.5 h-11" />
      </ResponsiveSheet>

      <ResponsiveSheet
        open={action === 'pipeline'}
        onOpenChange={(o) => !o && setAction(null)}
        title={t('pipelineTitle', { count: rows.length })}
        footer={
          <Button
            className="h-11 w-full"
            disabled={busy || !pipeline}
            onClick={() =>
              run((r) =>
                createDeal({ contact_id: r.id, pipeline_id: pipeline!.id, stage_id: stageId || pipeline!.stages[0].id, title: r.name, amount: null, currency: s.currency }),
              )
            }
          >
            {c('apply')}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pipeline">{t('pipeline')}</Label>
            <Select value={pipeline?.id ?? ''} onValueChange={(v) => { setPipelineId(v); setStageId(''); }}>
              <SelectTrigger id="bulk-pipeline" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(pipelines.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-stage">{t('stage')}</Label>
            <Select value={stageId || pipeline?.stages[0]?.id || ''} onValueChange={setStageId}>
              <SelectTrigger id="bulk-stage" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(pipeline?.stages ?? []).filter((x) => x.kind === 'open').map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
}
