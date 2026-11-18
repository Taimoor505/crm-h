'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { areaUnitLabel, currencySymbol, formatArea, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { formatPhone, parsePhone } from '@/lib/phone';
import type { CustomFieldDef } from '@/lib/api/types';

/** Displays a custom field value by type, in the workspace's formats. */
export function CustomFieldValue({ field, value }: { field: CustomFieldDef; value: unknown }) {
  const s = useWorkspaceSettings();
  if (value === null || value === undefined || value === '') return <span className="text-gray-400">—</span>;
  switch (field.type) {
    case 'money':
      return <span className="tabular-nums">{formatMoney(Number(value), s.currency, s)}</span>;
    case 'number':
      return <span className="tabular-nums">{formatNumber(Number(value), s)}</span>;
    case 'area':
      return <span className="tabular-nums">{formatArea(Number(value), s, 'sqft')}</span>;
    case 'date':
      return <span className="tabular-nums">{formatDate(String(value), s)}</span>;
    case 'phone':
      return <span dir="ltr" className="tabular-nums">{formatPhone(String(value), 'auto', s.country)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

/** Edits a custom field value by type. Money is entered in the workspace currency. */
export function CustomFieldInput({ field, value, onChange, id }: { field: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; id: string }) {
  const s = useWorkspaceSettings();
  const str = value === null || value === undefined ? '' : String(value);
  switch (field.type) {
    case 'select':
      return (
        <Select value={str} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'money':
      return (
        <div className="relative">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{currencySymbol(s.currency, s.locale)}</span>
          <Input id={id} type="number" inputMode="decimal" min={0} value={str} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="h-11 ps-12 tabular-nums" />
        </div>
      );
    case 'number':
      return <Input id={id} type="number" inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="h-11 tabular-nums" />;
    case 'area':
      return (
        <div className="relative">
          <Input id={id} type="number" inputMode="decimal" min={0} value={str} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="h-11 pe-14 tabular-nums" />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{areaUnitLabel('sqft')}</span>
        </div>
      );
    case 'date':
      return <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value || null)} className="h-11" />;
    case 'phone':
      return (
        <Input
          id={id}
          type="tel"
          defaultValue={str ? formatPhone(str, 'auto', s.country) : ''}
          onBlur={(e) => {
            const r = parsePhone(e.target.value, s.default_phone_country);
            onChange(r.ok ? r.e164 : e.target.value || null);
          }}
          className="h-11"
        />
      );
    default:
      return <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} className="h-11" />;
  }
}
