'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Columns3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeals, useMemberNames, useMoveDeal, usePipelines } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useIsDesktop } from '@/hooks/use-media-query';
import { usePermissions } from '@/lib/permissions';
import { formatMoneyValue } from '@/lib/format';
import { countUsefulAction } from '@/lib/ui-store';
import type { Deal, Stage } from '@/lib/api/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { DealCard } from '@/components/crm/DealCard';
import { ReasonSheet } from '@/components/crm/MoveDealSheet';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { cn } from '@/lib/utils';

// dnd-kit only loads on desktop (brief §10).
const Kanban = dynamic(() => import('@/components/crm/Kanban'), { ssr: false, loading: () => <ListSkeleton rows={4} /> });

export default function PipelinePage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PipelineView />
    </Suspense>
  );
}

function PipelineView() {
  const t = useTranslations('pipeline');
  const d = useTranslations('deal');
  const s = useWorkspaceSettings();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const { canWrite } = usePermissions();
  const ownerName = useMemberNames();
  const pipelines = usePipelines();

  const pipelineId = params.get('pipeline') ?? pipelines.data?.[0]?.id;
  const pipeline = pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.[0];
  const deals = useDeals(pipeline?.id);
  const move = useMoveDeal(pipeline?.id);
  const [closing, setClosing] = useState<{ deal: Deal; stage: Stage } | null>(null);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  function handleMove(deal: Deal, stage: Stage) {
    if (stage.kind !== 'open') {
      setClosing({ deal, stage });
      return;
    }
    countUsefulAction();
    move.mutate({ id: deal.id, stageId: stage.id });
    toast.success(d('moved', { stage: stage.name }));
  }

  const list = deals.data ?? [];
  const total = { amount_minor: list.filter((d) => pipeline?.stages.find((x) => x.id === d.stage_id)?.kind === 'open').reduce((a, d) => a + (d.value?.amount_minor ?? 0), 0), currency: list.find((d) => d.value)?.value?.currency ?? s.currency };
  const openCount = list.filter((d) => pipeline?.stages.find((x) => x.id === d.stage_id)?.kind === 'open').length;

  if (pipelines.isLoading) return <ListSkeleton rows={6} />;
  if (pipelines.isError) return <ErrorState onRetry={() => pipelines.refetch()} />;
  if (!pipeline) return <EmptyState icon={<Columns3 className="size-6" />} title={t('noPipelines')} body={t('noPipelinesBody')} />;

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={deals.data ? t('total', { count: openCount, value: formatMoneyValue(total, s, { compact: true }) }) : undefined}
        actions={
          (pipelines.data?.length ?? 0) > 1 ? (
            <Select value={pipeline.id} onValueChange={(v) => setParam({ pipeline: v, stage: null })}>
              <SelectTrigger aria-label={t('switch')} className="h-10 min-w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pipelines.data!.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {deals.isLoading ? (
        <ListSkeleton rows={5} />
      ) : deals.isError ? (
        <ErrorState onRetry={() => deals.refetch()} />
      ) : desktop ? (
        <Kanban pipeline={pipeline} deals={list} ownerName={ownerName} onMove={handleMove} disabled={!canWrite} />
      ) : (
        <MobileStages
          stages={pipeline.stages}
          deals={list}
          ownerName={ownerName}
          selected={params.get('stage')}
          onSelect={(id) => setParam({ stage: id })}
          onMove={canWrite ? handleMove : undefined}
        />
      )}

      {closing && (
        <ReasonSheet open onOpenChange={(o) => !o && setClosing(null)} deal={closing.deal} stage={closing.stage} pipeline={pipeline} />
      )}
    </div>
  );
}

/** Phones: stage tabs with counts, and a "Move to [next stage]" button on each card. */
function MobileStages({
  stages, deals, ownerName, selected, onSelect, onMove,
}: {
  stages: Stage[];
  deals: Deal[];
  ownerName: (id: string | null) => string | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove?: (deal: Deal, stage: Stage) => void;
}) {
  const t = useTranslations('pipeline');
  const s = useWorkspaceSettings();
  const current = stages.find((x) => x.id === selected) ?? stages[0];
  const inStage = useMemo(() => deals.filter((d) => d.stage_id === current.id), [deals, current.id]);
  const idx = stages.findIndex((x) => x.id === current.id);
  const next = current.kind === 'open' ? stages[idx + 1] ?? null : null;

  useEffect(() => {
    document.getElementById(`stage-tab-${current.id}`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current.id]);

  return (
    <div>
      <div role="tablist" aria-label={t('stages')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
        {stages.map((st) => {
          const count = deals.filter((d) => d.stage_id === st.id).length;
          const active = st.id === current.id;
          return (
            <button
              key={st.id}
              id={`stage-tab-${st.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(st.id)}
              className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium', active ? 'border-brand bg-brand text-on-brand' : 'border-gray-300 bg-white text-gray-800')}
            >
              {st.name}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/25' : 'bg-gray-100')}>{count}</span>
            </button>
          );
        })}
      </div>
      <p className="mb-3 text-sm text-gray-600">
        {t('stageTotal', { count: inStage.length, value: formatMoneyValue({ amount_minor: inStage.reduce((a, d) => a + (d.value?.amount_minor ?? 0), 0), currency: inStage[0]?.value?.currency ?? s.currency }, s) })}
      </p>
      {inStage.length ? (
        <ul role="tabpanel" className="space-y-2">
          {inStage.map((d) => (
            <li key={d.id}>
              <DealCard deal={d} ownerName={ownerName(d.owner_id)} nextStage={onMove ? next : null} onMoveNext={next && onMove ? () => onMove(d, next) : undefined} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('stageEmpty')} className="py-10" />
      )}
    </div>
  );
}
