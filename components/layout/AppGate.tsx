'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth/SessionProvider';
import { useAppState } from '@/lib/app-state';
import { getWorkspaceSettings } from '@/lib/api/endpoints/admin';
import { qk } from '@/hooks/queries/keys';
import { WorkspaceSettingsProvider, useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { BrandingProvider } from '@/lib/theme/BrandingProvider';
import { BootSplash } from '@/components/providers/AppProviders';
import { ErrorState } from '@/components/crm/states';

/**
 * Signed-in routes: needs a session and a workspace (or a partner/admin
 * area). Waits for region settings so money and dates format correctly on
 * the first paint.
 */
export function AppGate({ children, allowNoWorkspace }: { children: React.ReactNode; allowNoWorkspace?: boolean }) {
  const { session, hydrated, me, meLoading, meError, workspaceId } = useSession();
  const { suspended } = useAppState();
  const router = useRouter();
  const pathname = usePathname();

  const settings = useQuery({
    queryKey: qk.settings(workspaceId ?? ''),
    queryFn: () => getWorkspaceSettings(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 10 * 60_000,
  });

  const needsWorkspace = Boolean(me && !me.workspace && !allowNoWorkspace);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (suspended) {
      router.replace('/suspended');
      return;
    }
    if (needsWorkspace && me) {
      if (me.user.partner_admin_of) router.replace('/partner');
      else router.replace('/onboarding');
    }
  }, [hydrated, session, suspended, needsWorkspace, me, router, pathname]);

  if (!hydrated || !session || meLoading || suspended || needsWorkspace) return <BootSplash />;
  if (meError || !me) return <ErrorState onRetry={() => window.location.reload()} className="min-h-dvh" />;
  if (workspaceId && settings.isPending) return <BootSplash />;

  return (
    <WorkspaceSettingsProvider>
      <ThemedBranding workspaceId={workspaceId}>{children}</ThemedBranding>
    </WorkspaceSettingsProvider>
  );
}

function ThemedBranding({ workspaceId, children }: { workspaceId: string | null; children: React.ReactNode }) {
  const settings = useWorkspaceSettings();
  return (
    <BrandingProvider workspaceId={workspaceId} overrides={settings.branding}>
      {children}
    </BrandingProvider>
  );
}
