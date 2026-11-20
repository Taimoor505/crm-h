'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useUpdateWorkspaceSettings } from '@/hooks/queries/admin';
import { formatArea, formatDateTime, formatMoney, type RegionSettings } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { PhoneInput, toPhoneValue } from '@/components/crm/PhoneInput';
import { RegionFields } from '@/components/crm/RegionFields';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';

const SAMPLE_PHONES: Record<string, string> = { US: '+12125550123', AE: '+971501234567', GB: '+447700900123', PK: '+923001234567', IN: '+919876543210' };

export default function WorkspaceSettingsPage() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const settings = useWorkspaceSettings();
  const save = useUpdateWorkspaceSettings();
  const [name, setName] = useState(settings.name);
  const [region, setRegion] = useState<RegionSettings>(settings);
  const [phone, setPhone] = useState(() => toPhoneValue(settings.business_phone ?? '', settings.default_phone_country));

  useEffect(() => {
    setName(settings.name);
    setRegion(settings);
    setPhone(toPhoneValue(settings.business_phone ?? '', settings.default_phone_country));
  }, [settings]);

  const now = new Date();
  const preview = [
    { label: t('workspace.previewMoney'), value: formatMoney(1250000, region.currency, region) },
    { label: t('workspace.previewDate'), value: formatDateTime(now, region) },
    { label: t('workspace.previewArea'), value: formatArea(1200, region) },
    { label: t('workspace.previewPhone'), value: formatPhone(SAMPLE_PHONES[region.default_phone_country] ?? '+12125550123', 'auto', region.default_phone_country) },
  ];

  return (
    <SettingsPage title={t('nav.workspace')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const { country, locale, currency, timezone, date_format, time_format, week_starts_on, area_unit, default_phone_country } = region;
          save.mutate(
            { name: name.trim(), business_phone: phone.e164 ?? null, country, locale, currency, timezone, date_format, time_format, week_starts_on, area_unit, default_phone_country },
            { onSuccess: () => toast.success(t('saved')) },
          );
        }}
        className="space-y-4"
      >
        <SettingsCard>
          <Label htmlFor="ws-name">{t('workspace.name')}</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" />
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="ws-phone">{t('workspace.businessPhone')}</Label>
            <PhoneInput id="ws-phone" value={phone} onChange={setPhone} describedBy="ws-phone-hint" />
            <p id="ws-phone-hint" className="text-sm text-gray-600">{t('workspace.businessPhoneHint')}</p>
          </div>
        </SettingsCard>
        <SettingsCard title={t('workspace.region')}>
          <RegionFields value={region} onChange={setRegion} idPrefix="ws" extended />
        </SettingsCard>
        <SettingsCard title={t('workspace.preview')}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {preview.map((p) => (
              <div key={p.label} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-xs text-gray-500">{p.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{p.value}</dd>
              </div>
            ))}
          </dl>
        </SettingsCard>
        <div className="flex justify-end">
          <Button type="submit" className="h-11 min-w-32" disabled={save.isPending || !name.trim()}>
            {save.isPending ? c('saving') : c('save')}
          </Button>
        </div>
      </form>
    </SettingsPage>
  );
}
