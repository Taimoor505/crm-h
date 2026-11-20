'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bookmark, BookmarkPlus, Flame, Inbox, Sparkles, UserRound, Users, UserX, X } from 'lucide-react';
import type { ContactFilters, SavedView } from '@/lib/api/endpoints/crm';
import { useSavedViews } from '@/hooks/queries/crm';
import { usePermissions } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveSheet } from './ResponsiveSheet';
import { cn } from '@/lib/utils';

const KEYS: (keyof ContactFilters)[] = ['q', 'source', 'owner', 'status', 'tag', 'stage', 'created_within_days', 'awaiting'];
const clean = (f: ContactFilters) => Object.fromEntries(KEYS.filter((k) => f[k]).map((k) => [k, String(f[k])])) as ContactFilters;
const same = (a: ContactFilters, b: ContactFilters) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));
const EMPTY = Object.fromEntries(KEYS.map((k) => [k, undefined])) as ContactFilters;

/** Built-in and saved lead views as one-tap chips, plus "Save view" for the current filters. */
export function SavedViewsBar({ filters, onApply }: { filters: ContactFilters; onApply: (f: ContactFilters) => void }) {
  const t = useTranslations('leads');
  const c = useTranslations('common');
  const { can } = usePermissions();
  const { list, create, remove } = useSavedViews();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const manager = can('leads.view_all');

  const builtIn = [
    { key: 'all', label: t('viewAll'), icon: Users, filters: {} },
    { key: 'mine', label: t('viewMine'), icon: UserRound, filters: { owner: 'me' } },
    { key: 'waiting', label: t('viewWaiting'), icon: Inbox, filters: { awaiting: 'true' } },
    { key: 'new', label: t('viewNewWeek'), icon: Sparkles, filters: { created_within_days: '7' } },
    { key: 'hot', label: t('viewHot'), icon: Flame, filters: { status: 'hot' } },
    ...(manager ? [{ key: 'unassigned', label: t('viewUnassignedWeek'), icon: UserX, filters: { owner: 'none', created_within_days: '7' } }] : []),
  ] as { key: string; label: string; icon: typeof Users; filters: ContactFilters }[];
  const hasFilters = Object.keys(clean(filters)).length > 0;
  const matchesSaved = (list.data ?? []).some((v) => same(v.filters, filters));
  const matchesBuiltIn = builtIn.some((v) => same(v.filters, filters));

  const chip = (active: boolean) =>
    cn(
      'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium transition-colors',
      active ? 'border-transparent bg-gray-900 text-white shadow-card' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900',
    );

  return (
    <>
      <div role="group" aria-label={t('views')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {builtIn.map((v) => {
          const active = same(v.filters, filters);
          return (
            <button key={v.key} type="button" aria-pressed={active} className={chip(active)} onClick={() => onApply({ ...EMPTY, ...v.filters })}>
              <v.icon className="size-4" aria-hidden="true" />
              {v.label}
            </button>
          );
        })}
        {(list.data ?? []).map((v: SavedView) => {
          const active = same(v.filters, filters);
          return (
            <span key={v.id} className={cn(chip(active), 'pe-1')}>
              <button type="button" aria-pressed={active} className="inline-flex h-full items-center gap-1.5" onClick={() => onApply({ ...EMPTY, ...v.filters })}>
                <Bookmark className="size-4" aria-hidden="true" />
                {v.name}
                {v.shared && <span className={cn('rounded px-1 text-[10px] font-semibold uppercase', active ? 'bg-white/20' : 'bg-gray-100 text-gray-600')}>{t('sharedView')}</span>}
              </button>
              <button
                type="button"
                aria-label={t('removeView', { name: v.name })}
                className={cn('grid size-8 place-items-center rounded-md', active ? 'hover:bg-white/15' : 'hover:bg-gray-100')}
                onClick={() => remove.mutate(v.id)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          );
        })}
        {hasFilters && !matchesSaved && !matchesBuiltIn && (
          <button type="button" className={cn(chip(false), 'border-dashed text-brand-ink')} onClick={() => setSaving(true)}>
            <BookmarkPlus className="size-4" aria-hidden="true" />
            {t('saveView')}
          </button>
        )}
      </div>

      <ResponsiveSheet
        open={saving}
        onOpenChange={setSaving}
        title={t('saveViewTitle')} icon={Bookmark}
        footer={
          <Button
            className="h-11 w-full"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), filters: clean(filters), shared: manager && shared },
                {
                  onSuccess: () => {
                    toast.success(t('viewSaved'));
                    setSaving(false);
                    setName('');
                    setShared(false);
                  },
                },
              )
            }
          >
            {c('save')}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="view-name">{t('viewName')}</Label>
            <Input id="view-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('viewNamePlaceholder')} className="h-11" />
          </div>
          {manager && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} />
              {t('shareView')}
            </label>
          )}
        </div>
      </ResponsiveSheet>
    </>
  );
}
