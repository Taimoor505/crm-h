'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePermissions } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'clients', href: '/partner' },
  { key: 'branding', href: '/partner/branding' },
  { key: 'domains', href: '/partner/domains' },
  { key: 'billing', href: '/partner/billing' },
] as const;

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('partner');
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const allowed = can('partner.area');
  useEffect(() => {
    if (!allowed) router.replace('/home');
  }, [allowed, router]);
  if (!allowed) return null;
  return (
    <div>
      <PageHeader title={t('title')} />
      <nav aria-label={t('title')} className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
        {TABS.map((tab) => {
          const active = tab.href === '/partner' ? pathname === '/partner' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn('-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap', active ? 'border-brand text-brand-ink' : 'border-transparent text-gray-600 hover:text-gray-900')}
            >
              {t(`tabs.${tab.key}`)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
