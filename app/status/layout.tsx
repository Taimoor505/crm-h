import { AppProviders } from '@/components/providers/AppProviders';

export const dynamic = 'force-dynamic';

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
