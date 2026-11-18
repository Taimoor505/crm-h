'use client';

import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { InboxList } from '@/components/crm/InboxList';
import { EmptyState } from '@/components/crm/states';

export default function InboxPage() {
  const t = useTranslations('inbox');
  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="overflow-hidden rounded-xl border bg-card shadow-card lg:h-[calc(100dvh-11rem)]">
          <InboxList />
        </div>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block">
          <EmptyState icon={<MessageCircle className="size-6" />} title={t('selectConversation')} className="h-full" />
        </div>
      </div>
    </div>
  );
}
