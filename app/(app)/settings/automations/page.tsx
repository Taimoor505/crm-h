'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAutomations, useUpdateAutomation } from '@/hooks/queries/admin';
import { usePermissions } from '@/lib/permissions';
import type { Automation } from '@/lib/api/types';
import { SettingsPage } from '@/components/settings/SettingsCard';
import { SchemaForm } from '@/components/crm/SchemaForm';
import { RelativeTime } from '@/components/crm/values';
import { ErrorState, ListSkeleton } from '@/components/crm/states';

/** Preset rules only: an on/off toggle and a generated settings form. No workflow builder. */
export default function AutomationsPage() {
  const n = useTranslations('settings');
  const list = useAutomations();
  return (
    <SettingsPage title={n('nav.automations')} description={n('hints.automations')}>
      {list.isLoading ? <ListSkeleton rows={6} /> : list.isError ? <ErrorState onRetry={() => list.refetch()} /> : <div className="space-y-3">{list.data!.map((a) => <AutomationCard key={a.key} a={a} />)}</div>}
    </SettingsPage>
  );
}

function AutomationCard({ a }: { a: Automation }) {
  const t = useTranslations('settings.automations');
  const c = useTranslations('common');
  const { canWrite } = usePermissions();
  const update = useUpdateAutomation();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(a.settings);
  const hasSettings = Object.keys(a.settings_schema.properties ?? {}).length > 0;

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-semibold">{a.name}</h3>
          <p className="mt-0.5 text-sm text-gray-600">{a.description}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t('runs', { count: a.runs_7d })}
            {a.failed_7d > 0 && <span className="font-medium text-red-700"> · {t('failed', { count: a.failed_7d })}</span>}
            {' · '}
            {a.last_run_at ? <>{t('lastRun', { when: '' })}<RelativeTime iso={a.last_run_at} /></> : t('never')}
          </p>
        </div>
        {canWrite && (
          <Switch
            aria-label={t('toggle', { name: a.name })}
            checked={update.isPending && update.variables?.enabled !== undefined ? Boolean(update.variables.enabled) : a.enabled}
            onCheckedChange={(enabled) => update.mutate({ key: a.key, enabled }, { onSuccess: () => toast.success(t('saved')) })}
          />
        )}
      </div>
      {hasSettings && canWrite && (
        <div className="border-t">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t('settings')}
            <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {open && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate({ key: a.key, settings }, { onSuccess: () => toast.success(t('saved')) });
              }}
              className="space-y-4 px-4 pb-4"
            >
              <SchemaForm schema={a.settings_schema} value={settings} onChange={setSettings} idPrefix={a.key} />
              <div className="flex justify-end">
                <Button type="submit" className="h-10" disabled={update.isPending}>
                  {c('save')}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
