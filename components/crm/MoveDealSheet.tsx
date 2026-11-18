'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMoveDeal, useReasons } from '@/hooks/queries/crm';
import { countUsefulAction } from '@/lib/ui-store';
import type { Deal, Pipeline, Stage } from '@/lib/api/types';
import { ResponsiveSheet } from './ResponsiveSheet';
import { Chip } from './DuePicker';

/**
 * Asks for a reason when a deal moves to Won or Lost (one tap on a preset),
 * otherwise moves straight away. Optimistic, with rollback.
 */
export function ReasonSheet({
  open, onOpenChange, deal, stage, pipeline, onMoved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: Deal;
  stage: Stage;
  pipeline: Pipeline;
  onMoved?: () => void;
}) {
  const t = useTranslations('deal');
  const reasons = useReasons(pipeline.id);
  const move = useMoveDeal(pipeline.id);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState(false);
  const won = stage.kind === 'won';
  const presets = (won ? reasons.data?.won : reasons.data?.lost) ?? [];

  function submit(value: string) {
    if (!value.trim()) {
      setError(true);
      return;
    }
    move.mutate(
      { id: deal.id, stageId: stage.id, reason: won ? { won_reason: value.trim() } : { lost_reason: value.trim() } },
      { onSuccess: () => toast.success(t('moved', { stage: stage.name })) },
    );
    countUsefulAction();
    onOpenChange(false);
    onMoved?.();
  }

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={won ? t('wonTitle') : t('lostTitle')} description={deal.title}>
      <div className="space-y-4">
        <div className="grid gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submit(p)}
              className="min-h-12 rounded-lg border bg-white px-4 text-start text-sm font-medium hover:border-brand hover:bg-brand-surface"
            >
              {p}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(other || reason);
          }}
          className="space-y-2"
        >
          <Label htmlFor="reason-other">{t('otherReason')}</Label>
          <div className="flex gap-2">
            <Input id="reason-other" value={other} onChange={(e) => { setOther(e.target.value); setReason(''); setError(false); }} className="h-11 flex-1" aria-invalid={error || undefined} />
            <Button type="submit" className="h-11">
              {won ? t('markWon') : t('markLost')}
            </Button>
          </div>
          {error && <p className="text-sm text-red-700">{t('reasonRequired')}</p>}
        </form>
      </div>
    </ResponsiveSheet>
  );
}

/** Pick a stage for a deal; Won/Lost go through ReasonSheet. */
export function MoveDealSheet({ open, onOpenChange, deal, pipeline }: { open: boolean; onOpenChange: (o: boolean) => void; deal: Deal; pipeline: Pipeline }) {
  const t = useTranslations('deal');
  const move = useMoveDeal(pipeline.id);
  const [closing, setClosing] = useState<Stage | null>(null);

  return (
    <>
      <ResponsiveSheet open={open && !closing} onOpenChange={onOpenChange} title={t('moveTitle')} description={deal.title}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('moveTo')}</legend>
          <div className="flex flex-wrap gap-2">
            {pipeline.stages.map((st) => (
              <Chip
                key={st.id}
                selected={st.id === deal.stage_id}
                onClick={() => {
                  if (st.id === deal.stage_id) return;
                  if (st.kind !== 'open') {
                    setClosing(st);
                    return;
                  }
                  move.mutate({ id: deal.id, stageId: st.id }, { onSuccess: () => toast.success(t('moved', { stage: st.name })) });
                  countUsefulAction();
                  onOpenChange(false);
                }}
              >
                {st.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      </ResponsiveSheet>
      {closing && (
        <ReasonSheet
          open
          onOpenChange={(o) => {
            if (!o) {
              setClosing(null);
              onOpenChange(false);
            }
          }}
          deal={deal}
          stage={closing}
          pipeline={pipeline}
        />
      )}
    </>
  );
}
