'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Activity, ScrollText, Shield } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/crm/states';

/** Super-admin console: Phase 2 (brief §8.13). */
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
      {can('dev.logs') && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: '/admin/logs', icon: ScrollText, title: t('logs'), hint: t('logsHint') },
            { href: '/status', icon: Activity, title: t('statusPage'), hint: t('statusHint') },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card hover:bg-gray-50">
              <span className="grid size-10 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
                <l.icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{l.title}</span>
                <span className="block text-sm text-gray-600">{l.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
