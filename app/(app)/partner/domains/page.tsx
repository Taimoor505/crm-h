'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Globe, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePartnerDomains, usePartnerMutations } from '@/hooks/queries/admin';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { CopyField } from '@/components/crm/CopyField';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';

export default function PartnerDomainsPage() {
  const t = useTranslations('partner');
  const domains = usePartnerDomains();
  const m = usePartnerMutations();
  const [domain, setDomain] = useState('');

  return (
    <div className="space-y-4">
      <SettingsCard title={t('domains')} description={t('domainsHint')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!domain.trim()) return;
            m.addDomain.mutate(domain.trim().toLowerCase(), { onSuccess: () => { toast.success(t('domainAdded')); setDomain(''); } });
          }}
          className="flex gap-2"
        >
          <Input aria-label={t('domain')} placeholder={t('domainPlaceholder')} value={domain} onChange={(e) => setDomain(e.target.value)} className="h-11 flex-1 font-mono" />
          <Button type="submit" className="h-11" disabled={!domain.trim() || m.addDomain.isPending}>
            {t('addDomain')}
          </Button>
        </form>
      </SettingsCard>
      {domains.isLoading ? (
        <ListSkeleton rows={2} />
      ) : domains.isError ? (
        <ErrorState onRetry={() => domains.refetch()} />
      ) : !domains.data?.length ? (
        <SettingsCard>
          <EmptyState icon={<Globe className="size-6" />} title={t('noDomains')} className="py-6" />
        </SettingsCard>
      ) : (
        domains.data.map((d) => (
          <SettingsCard key={d.id}>
            <div className="flex items-center gap-3">
              <Globe className="size-5 text-gray-500" aria-hidden="true" />
              <p className="flex-1 truncate font-mono text-sm font-medium">{d.domain}</p>
              {d.verified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-800">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {t('verified')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                  <Clock className="size-4" aria-hidden="true" />
                  {t('pending')}
                </span>
              )}
              <button
                type="button"
                aria-label={t('removeDomain', { domain: d.domain })}
                onClick={() => m.deleteDomain.mutate(d.id, { onSuccess: () => toast.success(t('domainRemoved')) })}
                className="grid size-10 place-items-center rounded text-gray-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
            {!d.verified && d.dns && (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-sm">{t('dnsInstructions')}</p>
                <dl className="grid gap-2 sm:grid-cols-[6rem_1fr]">
                  <dt className="text-xs text-gray-500">{t('dnsType')}</dt>
                  <dd className="font-mono text-sm">{d.dns.type}</dd>
                  <dt className="text-xs text-gray-500">{t('dnsName')}</dt>
                  <dd><CopyField value={d.dns.name} label={t('dnsName')} /></dd>
                  <dt className="text-xs text-gray-500">{t('dnsValue')}</dt>
                  <dd><CopyField value={d.dns.value} label={t('dnsValue')} /></dd>
                </dl>
              </div>
            )}
          </SettingsCard>
        ))
      )}
    </div>
  );
}
