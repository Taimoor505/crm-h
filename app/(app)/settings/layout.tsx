'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { SECTIONS, SettingsNav } from '@/components/settings/SettingsNav';
import { usePermissions } from '@/lib/permissions';

/** Desktop: section menu beside the page. Phones: the index list, then each page full width. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('settings');
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const section = SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  const allowed = !section || can(section.permission);

  // Gate each page by permission; never show a page the role can't use.
  useEffect(() => {
    if (!allowed) router.replace('/settings');
  }, [allowed, router]);

  return (
    <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-8">
      <aside className="hidden lg:block">
        <h1 className="mb-4 font-heading text-2xl font-bold">{t('title')}</h1>
        <SettingsNav variant="side" />
      </aside>
      <div className="min-w-0">
        {section && (
          <Link href="/settings" className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 lg:hidden">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            {t('back')}
          </Link>
        )}
        {allowed ? children : null}
      </div>
    </div>
  );
}
