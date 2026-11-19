'use client';

import { useSession } from '@/lib/auth/SessionProvider';
import { BrandingProvider } from '@/lib/theme/BrandingProvider';

/** Login and onboarding: branding by hostname (partner domains), or the user's workspace once known. */
export function AuthBranding({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useSession();
  return <BrandingProvider workspaceId={workspaceId}>{children}</BrandingProvider>;
}
