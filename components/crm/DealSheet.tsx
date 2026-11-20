'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateDeal, usePipelines } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { updateDeal } from '@/lib/api/endpoints/crm';
import { currencySymbol, fromMinor } from '@/lib/format';
import { qk } from '@/hooks/queries/keys';
import type { Deal } from '@/lib/api/types';
import { ResponsiveSheet } from './ResponsiveSheet';
import { HandCoins } from 'lucide-react';

/** Create a deal for a lead, or edit an existing one. */
export function DealSheet({ open, onOpenChange, contactId, contactName, deal }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string; contactName?: string; deal?: Deal }) {
  const t = useTranslations('deal');
  const s = useWorkspaceSettings();
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const pipelines = usePipelines();
  const create = useCreateDeal();
  const [title, setTitle] = useState(deal?.title ?? contactName ?? '');
  const [amount, setAmount] = useState(deal?.value ? String(fromMinor(deal.value.amount_minor, deal.value.currency)) : '');
  const [pipelineId, setPipelineId] = useState(deal?.pipeline_id ?? '');
  const [stageId, setStageId] = useState(deal?.stage_id ?? '');
  const [expected, setExpected] = useState(deal?.expected_close ?? '');
  const [saving, setSaving] = useState(false);
  const pipeline = pipelines.data?.find((p) => p.id === (pipelineId || pipelines.data?.[0]?.id));
  const stage = stageId || pipeline?.stages.find((x) => x.kind === 'open')?.id || '';

  async function save() {
    if (!title.trim() || !pipeline) return;
    const value = amount === '' ? null : Number(amount);
    if (deal) {
      setSaving(true);
      try {
        await updateDeal(deal.id, { title: title.trim(), amount: value, currency: s.currency, expected_close: expected || null });
        qc.invalidateQueries({ queryKey: qk.deals(ws) });
        toast.success(t('updated'));
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
      return;
    }
    create.mutate(
      { contact_id: contactId, pipeline_id: pipeline.id, stage_id: stage, title: title.trim(), amount: value, currency: s.currency, expected_close: expected || null },
      {
        onSuccess: () => {
          toast.success(t('created'));
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={deal ? t('editTitle') : t('newTitle')} icon={HandCoins}
      footer={
        <Button className="h-11 w-full" onClick={save} disabled={!title.trim() || saving || create.isPending}>
          {t('save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="deal-title">{t('name')}</Label>
          <Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('namePlaceholder')} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deal-value">{t('value')}</Label>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{currencySymbol(s.currency, s.locale)}</span>
            <Input id="deal-value" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 ps-12 tabular-nums" />
          </div>
        </div>
        {!deal && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deal-pipeline">{t('pipeline')}</Label>
              <Select value={pipeline?.id ?? ''} onValueChange={(v) => { setPipelineId(v); setStageId(''); }}>
                <SelectTrigger id="deal-pipeline" className="h-11 w-full">
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
              <Label htmlFor="deal-stage">{t('stage')}</Label>
              <Select value={stage} onValueChange={setStageId}>
                <SelectTrigger id="deal-stage" className="h-11 w-full">
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
        )}
        <div className="space-y-1.5">
          <Label htmlFor="deal-close">{t('expectedClose')}</Label>
          <Input id="deal-close" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="h-11" />
        </div>
      </div>
    </ResponsiveSheet>
  );
}
