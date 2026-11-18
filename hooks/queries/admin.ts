'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as admin from '@/lib/api/endpoints/admin';
import type { AssignmentRules, Branding, LeadSource, WorkspaceSettings } from '@/lib/api/types';
import { useSession, useWorkspaceId } from '@/lib/auth/SessionProvider';
import { qk } from './keys';

export function useTemplates() {
  return useQuery({ queryKey: qk.templates(), queryFn: admin.listTemplates, staleTime: 60 * 60_000 });
}

export function useUpdateWorkspaceSettings() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Omit<WorkspaceSettings, 'branding'>> & { branding?: Partial<Branding> }) => admin.updateWorkspaceSettings(ws, patch),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings(ws), s);
      // Formats and labels change everywhere without a reload.
      qc.invalidateQueries({ queryKey: [ws] });
      qc.invalidateQueries({ queryKey: ['branding'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useClearSamples() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => admin.clearSampleData(ws),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws] }),
  });
}

export function useLeadSources(enabled = true) {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.leadSources(ws), queryFn: admin.listLeadSources, enabled: Boolean(ws) && enabled });
}

export function useLeadSourceMutations() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.leadSources(ws) });
  return {
    create: useMutation({ mutationFn: admin.createLeadSource, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (v: { id: string } & Partial<{ name: string; is_active: boolean; rotate_secret: true; settings: LeadSource['settings'] }>) => {
        const { id, ...patch } = v;
        return admin.updateLeadSource(id, patch);
      },
      onSuccess: invalidate,
    }),
  };
}

export function useAssignmentRules() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.assignment(ws), queryFn: admin.getAssignmentRules, enabled: Boolean(ws) });
}

export function useSaveAssignmentRules() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Omit<AssignmentRules, 'members'>) => admin.saveAssignmentRules(r),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.assignment(ws) }),
  });
}

export function useSetAvailability() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ available, userId }: { available: boolean; userId?: string }) => admin.setAvailability(available, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.assignment(ws) });
      qc.invalidateQueries({ queryKey: [ws, 'home'] });
    },
  });
}

export function useAutomations() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.automations(ws), queryFn: admin.listAutomations, enabled: Boolean(ws) });
}

export function useUpdateAutomation() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...patch }: { key: string; enabled?: boolean; settings?: Record<string, unknown> }) => admin.updateAutomation(key, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.automations(ws) }),
  });
}

export function useStartImport() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: admin.startImport,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts(ws) }),
  });
}

// ------------------------------------------------------------- billing

/** Partner admins bill their partner account; direct owners bill their workspace. */
export function useBillingScope(): { partnerId?: string; key: string } {
  const { me, workspaceId } = useSession();
  const partnerId = me?.user.partner_admin_of ?? undefined;
  return partnerId ? { partnerId, key: `p:${partnerId}` } : { key: `w:${workspaceId}` };
}

export function useSubscription(enabled = true) {
  const scope = useBillingScope();
  return useQuery({ queryKey: qk.subscription(scope.key), queryFn: () => admin.getSubscription(scope), enabled });
}

export function useInvoices(enabled = true) {
  const scope = useBillingScope();
  return useQuery({ queryKey: qk.invoices(scope.key), queryFn: () => admin.listInvoices(scope), enabled });
}

export function usePlans() {
  return useQuery({ queryKey: qk.plans(), queryFn: admin.listPlans, staleTime: 60 * 60_000 });
}

export function useChangePlan() {
  const scope = useBillingScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => admin.startOrChangePlan(planId, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}

export function useReportPayment() {
  const scope = useBillingScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => admin.reportPayment(form, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });
}

export function useCommission(month?: string) {
  const { me } = useSession();
  const partnerId = me?.user.partner_admin_of;
  return useQuery({ queryKey: qk.commission(partnerId ?? '', month), queryFn: () => admin.getCommissionStatement(partnerId!, month), enabled: Boolean(partnerId) });
}

// ------------------------------------------------------------- partner

export function usePartnerWorkspaces() {
  return useQuery({ queryKey: qk.partnerWorkspaces(), queryFn: admin.listPartnerWorkspaces });
}

export function usePartnerMutations() {
  const qc = useQueryClient();
  return {
    createWorkspace: useMutation({ mutationFn: admin.createPartnerWorkspace, onSuccess: () => qc.invalidateQueries({ queryKey: qk.partnerWorkspaces() }) }),
    updateBranding: useMutation({ mutationFn: admin.updatePartnerBranding, onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }) }),
    addDomain: useMutation({ mutationFn: admin.addPartnerDomain, onSuccess: () => qc.invalidateQueries({ queryKey: qk.partnerDomains() }) }),
    deleteDomain: useMutation({ mutationFn: admin.deletePartnerDomain, onSuccess: () => qc.invalidateQueries({ queryKey: qk.partnerDomains() }) }),
  };
}

export function usePartnerDomains() {
  return useQuery({ queryKey: qk.partnerDomains(), queryFn: admin.listPartnerDomains });
}
