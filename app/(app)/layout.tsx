import { AppProviders } from '@/components/providers/AppProviders';
import { AppGate } from '@/components/layout/AppGate';
import { AppShell } from '@/components/layout/AppShell';
import { QuickAddLeadHost } from '@/components/crm/QuickAddLead';
import { CallOutcomeHost } from '@/components/crm/CallOutcomeSheet';
import { DevSwitcher } from '@/components/dev/DevSwitcher';
import { PushPrompt } from '@/components/crm/PushPrompt';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppGate>
        <AppShell>{children}</AppShell>
        <QuickAddLeadHost />
        <CallOutcomeHost />
        <PushPrompt />
        <DevSwitcher />
      </AppGate>
    </AppProviders>
  );
}
