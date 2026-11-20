'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { Deal, Pipeline, Stage } from '@/lib/api/types';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { formatMoneyValue } from '@/lib/format';
import { DealCard } from './DealCard';
import { stageTone } from './badges';
import { cn } from '@/lib/utils';

function stageTotal(deals: Deal[], currency: string) {
  return { amount_minor: deals.reduce((a, d) => a + (d.value?.amount_minor ?? 0), 0), currency: deals.find((d) => d.value)?.value?.currency ?? currency };
}

function DraggableCard({ deal, ownerName, disabled }: { deal: Deal; ownerName: string | null; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { deal }, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', isDragging && 'opacity-40', !disabled && 'cursor-grab active:cursor-grabbing')}>
      <DealCard deal={deal} ownerName={ownerName} />
    </div>
  );
}

function Column({ stage, index, deals, ownerName, disabled }: { stage: Stage; index: number; deals: Deal[]; ownerName: (id: string | null) => string | null; disabled: boolean }) {
  const t = useTranslations('pipeline');
  const s = useWorkspaceSettings();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage } });
  return (
    <section aria-label={stage.name} className="relative flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-gray-100/80 ring-1 ring-black/5">
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', stageTone(index, stage.kind))} />
      <header className="space-y-1 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', stageTone(index, stage.kind))} />
          <h2 className="flex-1 truncate font-heading text-sm font-semibold text-gray-900">{stage.name}</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 tabular-nums shadow-card">{deals.length}</span>
        </div>
        <p className="ps-[18px] text-sm font-semibold text-gray-700 tabular-nums">
          {formatMoneyValue(stageTotal(deals, s.currency), s, { compact: true })}
        </p>
      </header>
      <div ref={setNodeRef} className={cn('stagger flex min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto rounded-b-2xl p-2.5 transition-colors', isOver && 'bg-brand-surface ring-2 ring-brand/50 ring-inset')}>
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} ownerName={ownerName(d.owner_id)} disabled={disabled} />
        ))}
        {!deals.length && <p className="py-6 text-center text-xs text-gray-500">{isOver ? t('dropHere') : t('stageEmpty')}</p>}
      </div>
    </section>
  );
}

/** Desktop kanban (dnd-kit). Won/Lost drops are handed to `onMove`, which asks for a reason. */
export default function Kanban({
  pipeline, deals, ownerName, onMove, disabled,
}: {
  pipeline: Pipeline;
  deals: Deal[];
  ownerName: (id: string | null) => string | null;
  onMove: (deal: Deal, stage: Stage) => void;
  disabled: boolean;
}) {
  const t = useTranslations('pipeline');
  const [active, setActive] = useState<Deal | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const stageName = (id: unknown) => pipeline.stages.find((s) => s.id === id)?.name ?? '';
  const dealTitle = (id: unknown) => deals.find((d) => d.id === id)?.contact?.name ?? deals.find((d) => d.id === id)?.title ?? '';

  function end(e: DragEndEvent) {
    setActive(null);
    const deal = e.active.data.current?.deal as Deal | undefined;
    const stage = e.over?.data.current?.stage as Stage | undefined;
    if (deal && stage && stage.id !== deal.stage_id) onMove(deal, stage);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActive((e.active.data.current?.deal as Deal) ?? null)}
      onDragEnd={end}
      onDragCancel={() => setActive(null)}
      accessibility={{
        screenReaderInstructions: { draggable: t('dragHint') },
        announcements: {
          onDragStart: ({ active: a }) => t('dndPickedUp', { title: dealTitle(a.id) }),
          onDragOver: ({ active: a, over }) => (over ? t('dndOver', { title: dealTitle(a.id), stage: stageName(over.id) }) : undefined),
          onDragEnd: ({ active: a, over }) => (over ? t('dndDropped', { title: dealTitle(a.id), stage: stageName(over.id) }) : undefined),
          onDragCancel: ({ active: a }) => t('dndCancelled', { title: dealTitle(a.id) }),
        },
      }}
    >
      <div className="flex min-h-[60vh] gap-3 overflow-x-auto pb-4">
        {pipeline.stages.map((stage, i) => (
          <Column key={stage.id} stage={stage} index={i} deals={deals.filter((d) => d.stage_id === stage.id)} ownerName={ownerName} disabled={disabled} />
        ))}
      </div>
      <DragOverlay>{active ? <DealCard deal={active} ownerName={ownerName(active.owner_id)} dragging className="w-68" /> : null}</DragOverlay>
    </DndContext>
  );
}
