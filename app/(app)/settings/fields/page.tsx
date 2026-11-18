'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFieldMutations, useFields } from '@/hooks/queries/crm';
import type { CustomFieldDef, CustomFieldType } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/crm/states';
import { cn } from '@/lib/utils';

const TYPES: CustomFieldType[] = ['text', 'number', 'money', 'date', 'select', 'phone'];

export default function FieldsSettingsPage() {
  const n = useTranslations('settings');
  const fields = useFields();
  const [adding, setAdding] = useState<'contact' | 'deal' | null>(null);
  if (fields.isLoading) return <PageSkeleton />;
  if (fields.isError) return <ErrorState onRetry={() => fields.refetch()} />;
  return (
    <SettingsPage title={n('nav.fields')}>
      {(['contact', 'deal'] as const).map((entity) => (
        <FieldList key={entity} entity={entity} fields={(fields.data ?? []).filter((f) => f.entity === entity)} onAdd={() => setAdding(entity)} />
      ))}
      {adding && <AddFieldSheet entity={adding} onClose={() => setAdding(null)} />}
    </SettingsPage>
  );
}

function FieldList({ entity, fields, onAdd }: { entity: 'contact' | 'deal'; fields: CustomFieldDef[]; onAdd: () => void }) {
  const t = useTranslations('settings.fields');
  const ft = useTranslations('fieldTypes');
  const n = useTranslations('settings');
  const m = useFieldMutations();
  const [editing, setEditing] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    const a = fields[i];
    const b = fields[i + dir];
    if (!a || !b) return;
    m.update.mutate({ id: a.id, position: b.position });
    m.update.mutate({ id: b.id, position: a.position });
  }

  return (
    <SettingsCard
      title={entity === 'contact' ? t('contactFields') : t('dealFields')}
      footer={
        <Button variant="outline" className="h-10" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          {t('add')}
        </Button>
      }
    >
      {fields.length ? (
        <ul className="divide-y divide-gray-100">
          {fields.map((f, i) => (
            <li key={f.id} className={cn('flex items-center gap-2 py-2', f.hidden && 'opacity-60')}>
              <div className="flex flex-col">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('moveUp', { label: f.label })} className="grid size-8 place-items-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={t('moveDown', { label: f.label })} className="grid size-8 place-items-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                {editing === f.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = new FormData(e.currentTarget).get('label') as string;
                      if (label.trim()) m.update.mutate({ id: f.id, label: label.trim() }, { onSuccess: () => toast.success(n('saved')) });
                      setEditing(null);
                    }}
                  >
                    <Input name="label" autoFocus defaultValue={f.label} aria-label={t('label')} onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="h-10" />
                  </form>
                ) : (
                  <button type="button" onClick={() => setEditing(f.id)} className="block w-full truncate text-start text-sm font-medium hover:underline">
                    {f.label}
                  </button>
                )}
                <p className="text-xs text-gray-500">
                  <span className="font-mono">{f.key}</span> · {ft(f.type)}
                  {f.options.length ? ` · ${f.options.join(', ')}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => m.update.mutate({ id: f.id, hidden: !f.hidden })}
                aria-label={f.hidden ? t('show', { label: f.label }) : t('hide', { label: f.label })}
                className="grid size-10 place-items-center rounded text-gray-500 hover:bg-gray-100"
              >
                {f.hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('empty')} className="py-6" />
      )}
    </SettingsCard>
  );
}

function AddFieldSheet({ entity, onClose }: { entity: 'contact' | 'deal'; onClose: () => void }) {
  const t = useTranslations('settings.fields');
  const ft = useTranslations('fieldTypes');
  const m = useFieldMutations();
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const autoKey = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40);
  const finalKey = keyTouched ? key : autoKey;
  const keyValid = /^[a-z][a-z0-9_]{0,40}$/.test(finalKey);

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('add')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!label.trim() || !keyValid || m.create.isPending}
          onClick={() =>
            m.create.mutate(
              { entity, key: finalKey, label: label.trim(), type, required, options: type === 'select' ? options.split('\n').map((o) => o.trim()).filter(Boolean) : undefined },
              { onSuccess: () => { toast.success(t('created')); onClose(); } },
            )
          }
        >
          {t('add')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="f-label">{t('label')}</Label>
          <Input id="f-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-key">{t('key')}</Label>
          <Input
            id="f-key"
            value={finalKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            aria-invalid={(finalKey && !keyValid) || undefined}
            aria-describedby="f-key-hint"
            className="h-11 font-mono"
          />
          <p id="f-key-hint" className={cn('text-xs', finalKey && !keyValid ? 'text-red-700' : 'text-gray-500')}>
            {finalKey && !keyValid ? t('invalidKey') : t('keyHint')}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-type">{t('type')}</Label>
          <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
            <SelectTrigger id="f-type" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((x) => (
                <SelectItem key={x} value={x}>
                  {ft(x)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {type === 'select' && (
          <div className="space-y-1.5">
            <Label htmlFor="f-options">{t('options')}</Label>
            <Textarea id="f-options" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} aria-describedby="f-options-hint" />
            <p id="f-options-hint" className="text-xs text-gray-500">{t('optionsHint')}</p>
          </div>
        )}
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
          {t('required')}
          <Switch checked={required} onCheckedChange={setRequired} />
        </label>
      </div>
    </ResponsiveSheet>
  );
}
