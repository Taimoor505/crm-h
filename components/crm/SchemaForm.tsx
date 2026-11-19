'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMembers, usePipelines } from '@/hooks/queries/crm';
import { useWhatsAppTemplates } from '@/hooks/queries/work';
import type { JsonSchema } from '@/lib/api/types';
import { humanize } from '@/lib/utils';

/**
 * Renders a settings form from an automation's JSON Schema (brief §8.10).
 * Supports string, number/integer, boolean, enum, durations (minutes), time,
 * and widgets for user, stage and WhatsApp template pickers.
 */
export function SchemaForm({ schema, value, onChange, idPrefix }: { schema: JsonSchema; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; idPrefix: string }) {
  const props = Object.entries(schema.properties ?? {});
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {props.map(([key, field]) => (
        <SchemaField key={key} id={`${idPrefix}-${key}`} field={field} name={key} value={value[key]} onChange={(v) => onChange({ ...value, [key]: v })} />
      ))}
    </div>
  );
}

function SchemaField({ id, name, field, value, onChange }: { id: string; name: string; field: JsonSchema; value: unknown; onChange: (v: unknown) => void }) {
  const t = useTranslations('settings.automations');
  const tt = useTranslations('taskTypes');
  const members = useMembers();
  const pipelines = usePipelines();
  const templates = useWhatsAppTemplates();
  const label = field.title ?? humanize(name);
  const type = Array.isArray(field.type) ? field.type[0] : field.type;
  const widget = field['x-widget'];

  if (type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium sm:col-span-2">
        {label}
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </label>
    );
  }

  const wrap = (control: React.ReactNode, wide = false) => (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
    </div>
  );

  if (widget === 'stage_select') {
    const stages = (pipelines.data ?? []).flatMap((p) => p.stages.map((s) => ({ ...s, pipeline: p.name })));
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-3">
          {stages.map((s) => (
            <label key={s.id} className="flex min-h-10 items-center gap-2 text-sm">
              <Checkbox checked={list.includes(s.id)} onCheckedChange={(v) => onChange(v === true ? [...list, s.id] : list.filter((x) => x !== s.id))} />
              {(pipelines.data?.length ?? 0) > 1 ? `${s.pipeline} · ${s.name}` : s.name}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (widget === 'user_select') {
    return wrap(
      <Select value={(value as string) ?? ''} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue placeholder={t('selectUser')} />
        </SelectTrigger>
        <SelectContent>
          {(members.data ?? []).map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  if (widget === 'whatsapp_template' && templates.data?.length) {
    return wrap(
      <Select value={(value as string) ?? ''} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {templates.data.map((tpl) => (
            <SelectItem key={tpl.name} value={tpl.name}>
              {tpl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  if (field.enum) {
    const isTaskType = field.enum.every((e) => ['call', 'whatsapp', 'meeting', 'site_visit', 'other'].includes(String(e)));
    return wrap(
      <Select value={String(value ?? field.default ?? '')} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.enum.map((e) => (
            <SelectItem key={String(e)} value={String(e)}>
              {isTaskType ? tt(String(e) as 'call') : humanize(String(e))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  if (type === 'integer' || type === 'number') {
    const minutes = field.format === 'duration-minutes';
    return wrap(
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={field.minimum}
          max={field.maximum}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={`h-11 tabular-nums ${minutes ? 'pe-20' : ''}`}
        />
        {minutes && <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{t('minutes')}</span>}
      </div>,
    );
  }

  if (field.format === 'time') {
    return wrap(<Input id={id} type="time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className="h-11" />);
  }

  return wrap(<Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className="h-11" />);
}
