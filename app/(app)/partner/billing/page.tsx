'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCommission } from '@/hooks/queries/admin';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { formatMoneyValue, formatPercent } from '@/lib/format';
import { BillingOverview } from '@/components/crm/Billing';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { EmptyState, ListSkeleton } from '@/components/crm/states';

export default function PartnerBillingPage() {
  const t = useTranslations('partner');
  const s = useWorkspaceSettings();
  const lastMonth = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 7);
  const [month, setMonth] = useState(lastMonth);
  const q = useCommission(month);

  return (
    <div className="space-y-4">
      <BillingOverview />
      <SettingsCard title={t('commission')}>
        <div className="mb-3 max-w-48 space-y-1.5">
          <Label htmlFor="c-month">{t('month')}</Label>
          <Input id="c-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-10" />
        </div>
        {q.isLoading ? (
          <ListSkeleton rows={3} />
        ) : !q.data?.applies ? (
          <EmptyState title={t('notApplies')} className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-gray-600">{t('rate', { rate: formatPercent(q.data.rate, s) })}</p>
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-gray-600">
                <tr>
                  <th scope="col" className="py-2 text-start font-medium">{t('colName')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('collected')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('commissionCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {q.data.workspaces.map((w) => (
                  <tr key={w.workspace_id}>
                    <td className="py-2.5 font-medium">{w.workspace_name}</td>
                    <td className="py-2.5 text-end tabular-nums">{formatMoneyValue(w.collected, s)}</td>
                    <td className="py-2.5 text-end tabular-nums">{formatMoneyValue(w.commission, s)}</td>
                  </tr>
                ))}
              </tbody>
              {q.data.total_commission && (
                <tfoot>
                  <tr className="border-t font-semibold">
                    <th scope="row" className="py-2.5 text-start">{t('totalCommission')}</th>
                    <td />
                    <td className="py-2.5 text-end tabular-nums">{formatMoneyValue(q.data.total_commission, s)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
