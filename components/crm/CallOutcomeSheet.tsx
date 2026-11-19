'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLogCall } from '@/hooks/queries/crm';
import { useCompleteTask, useCreateTask } from '@/hooks/queries/work';
import { countUsefulAction, type PendingCall } from '@/lib/ui-store';
import type { CallOutcome, Task } from '@/lib/api/types';
import { ResponsiveSheet } from './ResponsiveSheet';
import { Chip, DuePicker } from './DuePicker';

const OUTCOMES: CallOutcome[] = ['answered', 'no_answer', 'busy', 'wrong_number'];

export default function CallOutcomeSheet({ call, onClose }: { call: PendingCall; onClose: () => void }) {
  const t = useTranslations('callOutcome');
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const logCall = useLogCall(call.contactId);
  const complete = useCompleteTask();
  const create = useCreateTask();
  const busy = logCall.isPending || complete.isPending || create.isPending;

  async function save() {
    if (!outcome) {
      setShowError(true);
      return;
    }
    await logCall.mutateAsync({ outcome, note: note || undefined, deal_id: call.dealId });
    const followUp = next ? { type: 'call' as const, due_at: next } : undefined;
    if (call.taskId) {
      await complete.mutateAsync({ task: { id: call.taskId, contact_id: call.contactId } as Task, outcome, note: note || undefined, next: followUp });
    } else if (followUp) {
      await create.mutateAsync({ ...followUp, contact_id: call.contactId, deal_id: call.dealId ?? null });
    }
    countUsefulAction();
    toast.success(t('saved'));
    onClose();
  }

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('title')}
      description={t('with', { name: call.contactName })}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={onClose}>
            {t('skip')}
          </Button>
          <Button className="h-11 flex-1" onClick={save} disabled={busy}>
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('outcome')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <Chip key={o} selected={outcome === o} onClick={() => setOutcome(o)} className="justify-center rounded-lg">
                {t(o)}
              </Chip>
            ))}
          </div>
          {showError && !outcome && <p className="text-sm text-red-700">{t('chooseOutcome')}</p>}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="call-note">{t('note')}</Label>
          <Textarea id="call-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} rows={2} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('next')}</legend>
          <DuePicker allowNone onChange={setNext} initial={outcome === 'no_answer' || outcome === 'busy' ? 'tomorrow' : 'none'} idPrefix="call-next" />
        </fieldset>
      </div>
    </ResponsiveSheet>
  );
}
