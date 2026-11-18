'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { useUpdateWorkspaceSettings } from '@/hooks/queries/admin';
import { BrandingEditor } from '@/components/crm/BrandingEditor';
import { SettingsPage } from '@/components/settings/SettingsCard';
import { PageSkeleton } from '@/components/crm/states';

/** Workspace branding (owners and partners). Partner-wide branding lives in /partner. */
export default function BrandingSettingsPage() {
  const n = useTranslations('settings');
  const { branding, loading } = useBranding();
  const save = useUpdateWorkspaceSettings();
  if (loading) return <PageSkeleton />;
  return (
    <SettingsPage title={n('nav.branding')}>
      <BrandingEditor
        key={branding.appName + branding.primaryColor}
        initial={branding}
        saving={save.isPending}
        onSave={(b) => save.mutate({ branding: b }, { onSuccess: () => toast.success(n('saved')) })}
      />
    </SettingsPage>
  );
}
