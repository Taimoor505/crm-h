'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SettingsNav, useSections } from '@/components/settings/SettingsNav';
import { useIsDesktop } from '@/hooks/use-media-query';

export default function SettingsIndex() {
  const t = useTranslations('settings');
  const desktop = useIsDesktop();
  const sections = useSections();
  const router = useRouter();

  // Desktop shows the menu beside the first page instead of an empty index.
  useEffect(() => {
    if (desktop && sections[0]) router.replace(sections[0].href);
  }, [desktop, sections, router]);

  return (
    <div className="lg:hidden">
      <h1 className="mb-4 font-heading text-xl font-bold">{t('title')}</h1>
      <SettingsNav variant="list" />
    </div>
  );
}
