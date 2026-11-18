import { AppProviders } from '@/components/providers/AppProviders';
import { AuthBranding } from '@/components/layout/AuthBranding';

export default function SuspendedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AuthBranding>{children}</AuthBranding>
    </AppProviders>
  );
}
