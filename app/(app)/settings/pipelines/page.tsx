'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, X, Columns3} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAllDeals, usePipelineMutations, usePipelines, useReasons, useSaveReasons } from '@/hooks/queries/crm';
import type { Pipeline, Stage, StageKind } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { ErrorState, PageSkeleton } from '@/components/crm/states';
import { StageBadge } from '@/components/crm/badges';

export default function PipelinesSettingsPage() {
  const t = useTranslations('settings.pipelines');
  const n = useTranslations('settings');
  const pipelines = usePipelines();
  const m = usePipelineMutations();
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const pipeline = pipelines.data?.find((p) => p.id === selected) ?? pipelines.data?.[0];

  if (pipelines.isLoading) return <PageSkeleton />;
  if (pipelines.isError) return <ErrorState onRetry={() => pipelines.refetch()} />;

  return (
    <SettingsPage
      title={n('nav.pipelines')}
      actions={
        <Button variant="outline" className="h-10" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('addPipeline')}
        </Button>
      }
    >
      {(pipelines.data?.length ?? 0) > 1 && (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="p-select">{t('pipeline')}</Label>
          <Select value={pipeline?.id} onValueChange={setSelected}>
            <SelectTrigger id="p-select" className="h-11 w-full bg-white">
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
        </div>
      )}
      {pipeline && <StagesEditor key={pipeline.id} pipeline={pipeline} />}
      {pipeline && <ReasonsEditor key={`r-${pipeline.id}`} pipelineId={pipeline.id} />}

      <ResponsiveSheet
        open={adding}
        onOpenChange={setAdding}
        title={t('addPipeline')} icon={Columns3}
        footer={
          <Button
            className="h-11 w-full"
            disabled={!newName.trim() || m.createPipeline.isPending}
            onClick={() =>
              m.createPipeline.mutate(newName.trim(), {
                onSuccess: (p) => {
                  setSelected(p.id);
                  setNewName('');
                  setAdding(false);
                  toast.success(n('saved'));
                },
              })
            }
          >
            {t('addPipeline')}
          </Button>
        }
      >
        <Label htmlFor="new-pipeline">{t('pipelineName')}</Label>
        <Input id="new-pipeline" value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1.5 h-11" />
      </ResponsiveSheet>
    </SettingsPage>
  );
}

function SortableStage({ stage, onRename, onDelete }: { stage: Stage; onRename: (name: string) => void; onDelete: () => void }) {
  const t = useTranslations('settings.pipelines');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const [name, setName] = useState(stage.name);
  useEffect(() => setName(stage.name), [stage.name]);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded-lg border bg-white p-2 ${isDragging ? 'shadow-float' : ''}`}>
      <button type="button" {...attributes} {...listeners} aria-label={t('dragStage', { name: stage.name })} className="grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded text-gray-500 hover:bg-gray-100">
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <Input
        aria-label={t('rename', { name: stage.name })}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== stage.name && onRename(name.trim())}
        className="h-10 flex-1"
      />
      <StageBadge name={stage.kind} kind={stage.kind} className="hidden sm:inline-flex" />
      <button type="button" onClick={onDelete} aria-label={t('deleteStage', { name: stage.name })} className="grid size-10 shrink-0 place-items-center rounded text-gray-500 hover:bg-red-50 hover:text-red-700">
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function StagesEditor({ pipeline }: { pipeline: Pipeline }) {
  const t = useTranslations('settings.pipelines');
  const n = useTranslations('settings');
  const k = useTranslations('stageKind');
  const m = usePipelineMutations();
  const deals = useAllDeals();
  const [order, setOrder] = useState(pipeline.stages);
  const [newStage, setNewStage] = useState('');
  const [newKind, setNewKind] = useState<StageKind>('open');
  const [deleting, setDeleting] = useState<Stage | null>(null);
  const [moveTo, setMoveTo] = useState('');
  useEffect(() => setOrder(pipeline.stages), [pipeline.stages]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((s) => s.id === e.active.id);
    const to = order.findIndex((s) => s.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    // No batch reorder endpoint yet: one PATCH per moved stage.
    next.forEach((s, i) => {
      if (s.position !== i + 1) m.updateStage.mutate({ pipelineId: pipeline.id, stageId: s.id, position: i + 1 });
    });
  }

  const dealCount = deleting ? (deals.data ?? []).filter((d) => d.stage_id === deleting.id).length : 0;

  return (
    <SettingsCard title={t('stages')}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="stagger space-y-2">
            {order.map((s) => (
              <SortableStage
                key={s.id}
                stage={s}
                onRename={(name) => m.updateStage.mutate({ pipelineId: pipeline.id, stageId: s.id, name }, { onSuccess: () => toast.success(n('saved')) })}
                onDelete={() => {
                  setDeleting(s);
                  setMoveTo(order.find((x) => x.id !== s.id && x.kind === 'open')?.id ?? '');
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newStage.trim()) return;
          m.createStage.mutate({ pipelineId: pipeline.id, name: newStage.trim(), kind: newKind }, { onSuccess: () => setNewStage('') });
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <Input aria-label={t('stageName')} placeholder={t('stageName')} value={newStage} onChange={(e) => setNewStage(e.target.value)} className="h-11 min-w-40 flex-1" />
        <Select value={newKind} onValueChange={(v) => setNewKind(v as StageKind)}>
          <SelectTrigger aria-label={t('kind')} className="h-11 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['open', 'won', 'lost'] as const).map((x) => (
              <SelectItem key={x} value={x}>
                {k(x)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="h-11" disabled={!newStage.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          {t('addStage')}
        </Button>
      </form>

      {deleting && (
        <ResponsiveSheet
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('deleteTitle', { name: deleting.name })} icon={Trash2} tone={'danger'}
          description={t('deleteBody', { count: dealCount })}
          footer={
            <Button
              variant="destructive"
              className="h-11 w-full"
              disabled={!moveTo || m.deleteStage.isPending}
              onClick={() =>
                m.deleteStage.mutate(
                  { pipelineId: pipeline.id, stageId: deleting.id, moveTo },
                  { onSuccess: () => { toast.success(t('deleted')); setDeleting(null); } },
                )
              }
            >
              {t('deleteStage', { name: deleting.name })}
            </Button>
          }
        >
          <Label htmlFor="move-to">{t('moveDealsTo')}</Label>
          <Select value={moveTo} onValueChange={setMoveTo}>
            <SelectTrigger id="move-to" className="mt-1.5 h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {order.filter((x) => x.id !== deleting.id).map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ResponsiveSheet>
      )}
    </SettingsCard>
  );
}

function ReasonsEditor({ pipelineId }: { pipelineId: string }) {
  const t = useTranslations('settings.pipelines');
  const n = useTranslations('settings');
  const reasons = useReasons(pipelineId);
  const save = useSaveReasons(pipelineId);
  const [won, setWon] = useState<string[]>([]);
  const [lost, setLost] = useState<string[]>([]);
  useEffect(() => {
    if (reasons.data) {
      setWon(reasons.data.won);
      setLost(reasons.data.lost);
    }
  }, [reasons.data]);

  return (
    <SettingsCard
      title={t('reasons')}
      description={t('reasonsHint')}
      footer={
        <Button className="h-10" disabled={save.isPending} onClick={() => save.mutate({ won, lost }, { onSuccess: () => toast.success(n('saved')) })}>
          {t('saveReasons')}
        </Button>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ReasonList label={t('wonReasons')} items={won} set={setWon} id="won-reason" />
        <ReasonList label={t('lostReasons')} items={lost} set={setLost} id="lost-reason" />
      </div>
    </SettingsCard>
  );
}

function ReasonList({ label, items, set, id }: { label: string; items: string[]; set: (v: string[]) => void; id: string }) {
  const t = useTranslations('settings.pipelines');
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((r) => (
          <li key={r} className="inline-flex items-center gap-1 rounded-full bg-gray-100 ps-3 text-sm">
            {r}
            <button type="button" aria-label={t('removeReason', { reason: r })} onClick={() => set(items.filter((x) => x !== r))} className="grid size-8 place-items-center rounded-full hover:bg-gray-200">
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !items.includes(draft.trim())) set([...items, draft.trim()]);
          setDraft('');
        }}
        className="flex gap-2"
      >
        <Input id={id} aria-label={`${label}: ${t('addReason')}`} placeholder={t('reasonPlaceholder')} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-10 flex-1" />
        <Button type="submit" variant="outline" className="h-10">
          {t('addReason')}
        </Button>
      </form>
    </div>
  );
}
