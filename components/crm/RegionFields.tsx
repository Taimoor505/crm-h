'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CountryPicker } from './CountryPicker';
import { COMMON_CURRENCIES, regionFromCountry, supportedTimezones, type RegionSettings } from '@/lib/format';

/** Country pre-fills currency, time zone, phone country and units; each stays editable. */
export function RegionFields({ value, onChange, idPrefix = 'region', extended }: { value: RegionSettings; onChange: (v: RegionSettings) => void; idPrefix?: string; extended?: boolean }) {
  const t = useTranslations('onboarding');
  const r = useTranslations('regionFields');
  const zones = useMemo(() => {
    const all = supportedTimezones();
    return all.includes(value.timezone) ? all : [value.timezone, ...all];
  }, [value.timezone]);
  const currencies = COMMON_CURRENCIES.includes(value.currency) ? COMMON_CURRENCIES : [value.currency, ...COMMON_CURRENCIES];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-country`}>{t('country')}</Label>
        <CountryPicker id={`${idPrefix}-country`} value={value.country} showDial={false} onChange={(c) => onChange(regionFromCountry(c))} className="w-full justify-start" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-currency`}>{t('currency')}</Label>
        <Select value={value.currency} onValueChange={(currency) => onChange({ ...value, currency })}>
          <SelectTrigger id={`${idPrefix}-currency`} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-tz`}>{t('timezone')}</Label>
        <select
          id={`${idPrefix}-tz`}
          value={value.timezone}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-phone`}>{t('phoneCountry')}</Label>
        <CountryPicker id={`${idPrefix}-phone`} value={value.default_phone_country} onChange={(c) => onChange({ ...value, default_phone_country: c })} className="w-full justify-start" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-area`}>{t('areaUnit')}</Label>
        <Select value={value.area_unit} onValueChange={(area_unit) => onChange({ ...value, area_unit: area_unit as 'sqft' | 'sqm' })}>
          <SelectTrigger id={`${idPrefix}-area`} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sqft">{r('sqft')}</SelectItem>
            <SelectItem value="sqm">{r('sqm')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {extended && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-datefmt`}>{r('dateFormat')}</Label>
            <Select value={value.date_format} onValueChange={(date_format) => onChange({ ...value, date_format })}>
              <SelectTrigger id={`${idPrefix}-datefmt`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['dd MMM yyyy', 'MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd MMMM yyyy'].map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-timefmt`}>{r('timeFormat')}</Label>
            <Select value={value.time_format} onValueChange={(time_format) => onChange({ ...value, time_format: time_format as '12h' | '24h' })}>
              <SelectTrigger id={`${idPrefix}-timefmt`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">{r('h12')}</SelectItem>
                <SelectItem value="24h">{r('h24')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-week`}>{r('weekStart')}</Label>
            <Select value={String(value.week_starts_on)} onValueChange={(v) => onChange({ ...value, week_starts_on: Number(v) as 0 | 1 | 6 })}>
              <SelectTrigger id={`${idPrefix}-week`} className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{r('monday')}</SelectItem>
                <SelectItem value="0">{r('sunday')}</SelectItem>
                <SelectItem value="6">{r('saturday')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
