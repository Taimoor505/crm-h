import { AppProviders } from '@/components/providers/AppProviders';
import { AppGate } from '@/components/layout/AppGate';
import { AppShell } from '@/components/layout/AppShell';
import { QuickAddLeadHost } from '@/components/crm/QuickAddLeadHost';
import { CallOutcomeHost } from '@/components/crm/CallOutcomeHost';
import { DevSwitcher } from '@/components/dev/DevSwitcherHost';
import { PushPrompt } from '@/components/crm/PushPrompt';
import { OfflineSync } from '@/components/providers/OfflineSync';
import { PwaRegister } from '@/components/providers/PwaRegister';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppGate>
        <AppShell>{children}</AppShell>
        <QuickAddLeadHost />
        <CallOutcomeHost />
        <PushPrompt />
        <DevSwitcher />
        <OfflineSync />
        <PwaRegister />
      </AppGate>
    </AppProviders>
  );
}
