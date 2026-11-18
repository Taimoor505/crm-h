'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAssignmentRules, useLeadSources, useSaveAssignmentRules, useSetAvailability } from '@/hooks/queries/admin';
import type { AssignmentRules } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ErrorState, PageSkeleton } from '@/components/crm/states';
import { Avatar } from '@/components/crm/badges';
import { cn, humanize } from '@/lib/utils';

const MODES = ['manual', 'round_robin', 'by_source'] as const;

export default function AssignmentPage() {
  const t = useTranslations('settings.assignment');
  const n = useTranslations('settings');
  const c = useTranslations('common');
  const rules = useAssignmentRules();
  const sources = useLeadSources();
  const save = useSaveAssignmentRules();
  const availability = useSetAvailability();
  const [draft, setDraft] = useState<AssignmentRules | null>(null);
  useEffect(() => {
    if (rules.data) setDraft(rules.data);
  }, [rules.data]);

  if (rules.isLoading || !draft) return <PageSkeleton />;
  if (rules.isError) return <ErrorState onRetry={() => rules.refetch()} />;

  const sellers = draft.members.filter((m) => m.role !== 'owner' || draft.members.length === 1);
  const togglePool = (id: string, on: boolean, list = draft.agent_ids) => (on ? [...list, id] : list.filter((x) => x !== id));
  const labels = Array.from(new Set((sources.data ?? []).map((s) => s.source_label)));

  return (
    <SettingsPage title={n('nav.assignment')}>
      <SettingsCard title={t('mode')}>
        <div role="radiogroup" aria-label={t('mode')} className="grid gap-2 md:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={draft.mode === m}
              onClick={() => setDraft({ ...draft, mode: m })}
              className={cn('rounded-xl border-2 p-3 text-start', draft.mode === m ? 'border-brand bg-brand-surface' : 'border-gray-200 hover:border-gray-300')}
            >
              <span className="block text-sm font-semibold">{t(m)}</span>
              <span className="mt-0.5 block text-xs text-gray-600">{t(`${m}Hint`)}</span>
            </button>
          ))}
        </div>
      </SettingsCard>

      {draft.mode !== 'manual' && (
        <SettingsCard title={t('pool')}>
          <ul className="space-y-1">
            {sellers.map((m) => (
              <li key={m.user_id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-gray-50">
                  <Checkbox checked={draft.agent_ids.includes(m.user_id)} onCheckedChange={(v) => setDraft({ ...draft, agent_ids: togglePool(m.user_id, v === true) })} />
                  <Avatar name={m.name} seed={m.user_id} size="sm" />
                  <span className="text-sm font-medium">{m.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}

      {draft.mode === 'by_source' && labels.length > 0 && (
        <SettingsCard title={t('sourceMap')}>
          <div className="space-y-4">
            {labels.map((label) => (
              <fieldset key={label}>
                <legend className="mb-1.5 text-sm font-medium">{t('sourceAgents', { source: humanize(label) })}</legend>
                <div className="flex flex-wrap gap-3">
                  {sellers.map((m) => {
                    const list = draft.source_map[label] ?? [];
                    return (
                      <label key={m.user_id} className="flex min-h-10 items-center gap-2 text-sm">
                        <Checkbox
                          checked={list.includes(m.user_id)}
                          onCheckedChange={(v) => setDraft({ ...draft, source_map: { ...draft.source_map, [label]: togglePool(m.user_id, v === true, list) } })}
                        />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </SettingsCard>
      )}

      {draft.mode !== 'manual' && (
        <SettingsCard title={t('reassign')}>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reassign">{t('reassignAfter')}</Label>
              <Input
                id="reassign"
                type="number"
                min={5}
                max={1440}
                placeholder={t('reassignOff')}
                value={draft.reassign_after_minutes ?? ''}
                onChange={(e) => setDraft({ ...draft, reassign_after_minutes: e.target.value ? Math.max(5, Number(e.target.value)) : null })}
                className="h-11 w-40"
              />
            </div>
          </div>
        </SettingsCard>
      )}

      <div className="flex justify-end">
        <Button
          className="h-11 min-w-32"
          disabled={save.isPending}
          onClick={() => {
            const { members: _members, ...input } = draft;
            save.mutate(input, { onSuccess: () => toast.success(n('saved')) });
          }}
        >
          {save.isPending ? c('saving') : c('save')}
        </Button>
      </div>

      <SettingsCard title={t('availability')}>
        <ul className="space-y-1">
          {draft.members.map((m) => (
            <li key={m.user_id}>
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 hover:bg-gray-50">
                <span className="flex items-center gap-3">
                  <Avatar name={m.name} seed={m.user_id} size="sm" />
                  <span className="text-sm font-medium">{m.name}</span>
                </span>
                <Switch
                  aria-label={t('available', { name: m.name ?? '' })}
                  checked={m.available}
                  onCheckedChange={(v) => {
                    setDraft({ ...draft, members: draft.members.map((x) => (x.user_id === m.user_id ? { ...x, available: v } : x)) });
                    availability.mutate({ available: v, userId: m.user_id });
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SettingsPage>
  );
}
