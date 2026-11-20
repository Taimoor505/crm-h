'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { usePartnerMutations } from '@/hooks/queries/admin';
import { getPartnerBranding } from '@/lib/api/endpoints/admin';
import { BrandingEditor } from '@/components/crm/BrandingEditor';
import { PageSkeleton } from '@/components/crm/states';

/** Partner-wide default branding for every client workspace. */
export default function PartnerBrandingPage() {
  const t = useTranslations('partner');
  const n = useTranslations('settings');
  const m = usePartnerMutations();
  const q = useQuery({ queryKey: ['branding', 'partner-default'], queryFn: getPartnerBranding });
  if (q.isLoading || !q.data) return <PageSkeleton />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t('brandingHint')}</p>
      <BrandingEditor
        initial={q.data}
        saving={m.updateBranding.isPending}
        showModules={false}
        scope="partner"
        onSave={(b) => m.updateBranding.mutate(b, { onSuccess: () => { toast.success(n('saved')); q.refetch(); } })}
      />
    </div>
  );
}
