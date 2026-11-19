import { AppProviders } from '@/components/providers/AppProviders';
import { AuthBranding } from '@/components/layout/AuthBranding';

export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AuthBranding>{children}</AuthBranding>
    </AppProviders>
  );
}
