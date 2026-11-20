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
        key={JSON.stringify(branding)}
        initial={branding}
        saving={save.isPending}
        onSave={(b) => {
          // Send only what changed, so everything else keeps following the partner's brand.
          const changed = Object.fromEntries(
            Object.entries(b).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(branding[k as keyof typeof branding] ?? null)),
          );
          save.mutate({ branding: changed }, { onSuccess: () => toast.success(n('saved')) });
        }}
      />
    </SettingsPage>
  );
}
