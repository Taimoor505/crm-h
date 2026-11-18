'use client';

import { useTranslations } from 'next-intl';
import { BillingOverview } from '@/components/crm/Billing';
import { SettingsPage } from '@/components/settings/SettingsCard';

/** Owners only (gated in settings/layout). Target of the read-only banner's link. */
export default function BillingPage() {
  const n = useTranslations('settings');
  return (
    <SettingsPage title={n('nav.billing')}>
      <BillingOverview />
    </SettingsPage>
  );
}
