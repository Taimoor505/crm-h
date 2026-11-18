'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/hooks/queries/work';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { enablePush, pushSupport } from '@/lib/push';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { PhoneInput, toPhoneValue } from '@/components/crm/PhoneInput';
import { ErrorState, PageSkeleton } from '@/components/crm/states';

export default function NotificationSettingsPage() {
  const t = useTranslations('settings.notifications');
  const n = useTranslations('settings');
  const p = useTranslations('pushPrompt');
  const c = useTranslations('common');
  const s = useWorkspaceSettings();
  const q = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [number, setNumber] = useState<ReturnType<typeof toPhoneValue> | null>(null);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const data = q.data;
  const phone = number ?? toPhoneValue(data.whatsapp_number ?? '', s.default_phone_country);
  const save = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onSuccess: () => toast.success(n('saved')) });

  return (
    <SettingsPage title={n('nav.notifications')}>
      <SettingsCard title={t('events')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-600">
                <th scope="col" className="py-2 text-start font-medium" />
                <th scope="col" className="px-2 py-2 text-center font-medium">{t('inApp')}</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">{t('push')}</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">{t('whatsapp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.events.map((e) => (
                <tr key={e.type}>
                  <th scope="row" className="py-2.5 pe-3 text-start font-normal">{e.label}</th>
                  <td className="px-2 text-center">
                    <Switch checked disabled aria-label={`${t('inApp')}: ${e.label}`} />
                  </td>
                  <td className="px-2 text-center">
                    <Switch checked={e.push} aria-label={t('pushFor', { event: e.label })} onCheckedChange={(v) => save({ events: [{ type: e.type, push: v }] })} />
                  </td>
                  <td className="px-2 text-center">
                    <Switch checked={e.whatsapp} aria-label={t('whatsappFor', { event: e.label })} onCheckedChange={(v) => save({ events: [{ type: e.type, whatsapp: v }] })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <SettingsCard>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-semibold">{t('quietHours')}</span>
            <span className="block text-xs text-gray-600">{t('quietHoursHint', { window: data.quiet_hours_window })}</span>
          </span>
          <Switch checked={data.quiet_hours} onCheckedChange={(v) => save({ quiet_hours: v })} />
        </label>
      </SettingsCard>

      <SettingsCard
        title={t('whatsappNumber')}
        description={t('whatsappNumberHint')}
        footer={
          <Button className="h-10" disabled={update.isPending || (phone.raw !== '' && !phone.e164)} onClick={() => save({ whatsapp_number: phone.e164 ?? null })}>
            {c('save')}
          </Button>
        }
      >
        <Label htmlFor="wa-number" className="sr-only">{t('whatsappNumber')}</Label>
        <PhoneInput id="wa-number" value={phone} onChange={setNumber} />
      </SettingsCard>

      <SettingsCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">{t('devices', { count: data.push.devices })}</p>
          {pushSupport() === 'supported' && (
            <Button
              variant="outline"
              className="h-10"
              onClick={async () => {
                const r = await enablePush(data.push.vapid_public_key).catch(() => 'unsupported' as const);
                if (r === 'granted') toast.success(p('enabled'));
                else if (r === 'denied') toast.error(p('denied'));
                q.refetch();
              }}
            >
              <BellRing className="size-4" aria-hidden="true" />
              {t('enablePush')}
            </Button>
          )}
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
