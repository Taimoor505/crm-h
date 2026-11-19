'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Code2, Shield } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/crm/states';

/** Super-admin console: Phase 2 (brief §8.13). The workbench link lives here. */
export default function AdminPage() {
  const t = useTranslations('admin');
  const { can } = usePermissions();
  const router = useRouter();
  const allowed = can('admin.console');
  useEffect(() => {
    if (!allowed) router.replace('/home');
  }, [allowed, router]);
  if (!allowed) return null;
  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} />
      <div className="rounded-2xl border bg-card shadow-card">
        <EmptyState icon={<Shield className="size-6" />} title={t('title')} body={t('body')} />
      </div>
      {can('dev.workbench') && (
        <Link href="/dev/workbench" className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card hover:bg-gray-50">
          <span className="grid size-10 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
            <Code2 className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">{t('workbench')}</span>
            <span className="block text-sm text-gray-600">{t('workbenchHint')}</span>
          </span>
        </Link>
      )}
    </div>
  );
}
