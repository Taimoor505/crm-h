import { api } from '../client';
import { adaptBrandingConfig, adaptWorkspace, money, moneyOrZero, type Raw } from '../adapters';
import type {
  AssignmentRules, Automation, Branding, CommissionStatement, ImportJob, Invoice, LeadSource, PartnerDomain,
  PartnerWorkspace, Plan, RegionSettings, Subscription, Template, Workspace, WorkspaceRole, WorkspaceSettings,
} from '../types';

// ------------------------------------------------------------- workspace & region

/** TODO(backend): missing endpoint, served by MSW (brief §12.1). */
export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const r = await api.get<Raw>(`/workspaces/${workspaceId}/settings`, undefined, { workspaceId });
  return r.data;
}

export async function updateWorkspaceSettings(workspaceId: string, patch: Partial<Omit<WorkspaceSettings, 'branding'>> & { branding?: Partial<Branding> }): Promise<WorkspaceSettings> {
  const r = await api.patch<Raw>(`/workspaces/${workspaceId}/settings`, patch, { workspaceId });
  return r.data;
}

/** TODO(backend): missing endpoint, served by MSW. */
export async function listTemplates(): Promise<Template[]> {
  return (await api.get<Raw>('/templates', undefined, { workspaceId: false })).data;
}

export interface CreateWorkspaceInput {
  name: string;
  template_key: string;
  region: RegionSettings;
  seed_samples?: boolean;
  branding?: Partial<Branding>;
  owner_name?: string;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const r = await api.post<Raw>(
    '/workspaces',
    // TODO(backend): region fields are ignored by the sandbox until §12.1 ships; timezone is honoured.
    { ...input, ...input.region, seed_samples: input.seed_samples ?? true, locale: 'en' },
    { workspaceId: false },
  );
  return adaptWorkspace(r.workspace ?? r.data);
}

/** TODO(backend): missing endpoint, served by MSW. */
export async function clearSampleData(workspaceId: string) {
  return (await api.post<Raw>(`/workspaces/${workspaceId}/clear-samples`, {}, { workspaceId })).data as { removed: number };
}

// ------------------------------------------------------------- lead sources

export async function listLeadSources(): Promise<LeadSource[]> {
  return (await api.get<Raw>('/lead-sources')).data;
}

export async function createLeadSource(input: {
  type: LeadSource['type'];
  name: string;
  source_label?: string;
  settings?: LeadSource['settings'];
  meta?: { page_id: string; page_access_token: string; form_ids?: string[] };
}): Promise<LeadSource> {
  return (await api.post<Raw>('/lead-sources', input)).data;
}

export async function updateLeadSource(id: string, patch: Partial<{ name: string; is_active: boolean; rotate_secret: true; settings: LeadSource['settings'] }>): Promise<LeadSource> {
  const r = await api.patch<Raw>(`/lead-sources/${id}`, patch);
  return r.data ?? r;
}

// ------------------------------------------------------------- assignment

export async function getAssignmentRules(): Promise<AssignmentRules> {
  return (await api.get<Raw>('/assignment-rules')).data;
}

export async function saveAssignmentRules(input: Omit<AssignmentRules, 'members'>): Promise<AssignmentRules> {
  const r = await api.put<Raw>('/assignment-rules', input);
  return r.data ?? r;
}

export async function setAvailability(available: boolean, userId?: string) {
  return api.put<Raw>('/availability', { available, user_id: userId });
}

// ------------------------------------------------------------- automations

export async function listAutomations(): Promise<Automation[]> {
  return (await api.get<Raw>('/automations')).data;
}

export async function updateAutomation(key: string, patch: { enabled?: boolean; settings?: Record<string, unknown> }) {
  return (await api.patch<Raw>(`/automations/${key}`, patch)).data as { key: string; enabled: boolean; settings: Record<string, unknown> };
}

// ------------------------------------------------------------- import

export async function startImport(input: {
  rows: Record<string, string>[];
  mapping: Record<string, string>;
  duplicate_strategy: 'skip' | 'update';
  file_name: string;
  phone_country: string;
}): Promise<ImportJob> {
  // TODO(backend): phone_country is ignored until §12.2; the frontend sends E.164 already.
  const r = await api.post<Raw>('/imports', input);
  return r.import_job;
}

export async function getImport(id: string): Promise<ImportJob> {
  const r = await api.get<Raw>(`/imports/${id}`);
  return r.import_job ?? r.data ?? r;
}

// ------------------------------------------------------------- billing

type BillingScope = { partnerId?: string };

export async function getSubscription(scope: BillingScope = {}): Promise<Subscription | null> {
  const r = await api.get<Raw>('/billing/subscription', undefined, { partnerId: scope.partnerId, workspaceId: scope.partnerId ? false : undefined });
  const d = r.data;
  if (!d?.subscription) return null;
  return {
    plan: d.plan ? { id: d.plan.id, name: d.plan.name } : null,
    status: d.subscription.status,
    trial_ends_at: d.subscription.trial_ends_at ?? d.trial?.ends_at ?? null,
    pending_plan: d.pending_plan ? { id: d.pending_plan.id, name: d.pending_plan.name } : null,
    pending_plan_effective: d.pending_plan_effective ?? null,
    workspaces: (d.workspaces ?? []).map((w: Raw) => ({ id: w.id, name: w.name, status: w.status })),
    outstanding: money(d, 'outstanding'),
    overdue_invoices: Array.isArray(d.overdue_invoices) ? d.overdue_invoices.length : d.overdue_invoices ?? 0,
  };
}

export async function listPlans(): Promise<Plan[]> {
  const r = await api.get<Raw>('/billing/plans');
  return r.data.map((p: Raw) => ({
    id: p.id,
    name: p.name,
    description: p.billing_type === 'commission' ? null : null,
    price: money(p, 'price_per_month'),
  }));
}

export async function startOrChangePlan(planId: string, scope: BillingScope = {}, identity?: string) {
  return api.post<Raw>('/billing/subscription', { plan_id: planId, identity }, { partnerId: scope.partnerId, workspaceId: scope.partnerId ? false : undefined });
}

export async function listInvoices(scope: BillingScope = {}): Promise<Invoice[]> {
  const r = await api.get<Raw>('/billing/invoices', undefined, { partnerId: scope.partnerId, workspaceId: scope.partnerId ? false : undefined });
  return r.data.map((i: Raw) => ({
    id: i.id, number: i.number, period_start: i.period_start, issue_date: i.issue_date, due_date: i.due_date, status: i.status,
    total: moneyOrZero(i, 'total'), paid: moneyOrZero(i, 'paid'),
  }));
}

export async function reportPayment(form: FormData, scope: BillingScope = {}) {
  return api.post<Raw>('/billing/payments', undefined, { form, partnerId: scope.partnerId, workspaceId: scope.partnerId ? false : undefined });
}

export async function getCommissionStatement(partnerId: string, month?: string): Promise<CommissionStatement> {
  const d = (await api.get<Raw>('/billing/commission-statement', { month }, { partnerId, workspaceId: false })).data;
  return {
    month: d.month,
    applies: d.applies,
    rate: d.rate,
    workspaces: (d.workspaces ?? []).map((w: Raw) => ({
      workspace_id: w.workspace_id, workspace_name: w.workspace_name,
      collected: moneyOrZero(w, 'amount_collected'), commission: moneyOrZero(w, 'commission'),
      floor_applied: w.floor_applied, status: w.status,
    })),
    total_commission: money(d.totals, 'commission'),
  };
}

// ------------------------------------------------------------- partner

export async function listPartnerWorkspaces(): Promise<PartnerWorkspace[]> {
  const r = await api.get<Raw>('/partner/workspaces', undefined, { workspaceId: false });
  return r.data.map((w: Raw) => ({
    id: w.id,
    name: w.name,
    template_key: w.template_key,
    // TODO(backend): status/plan/seats/country aren't on this endpoint yet.
    status: w.billing_status ?? w.status ?? 'active',
    country: w.country ?? null,
    plan: w.plan ?? null,
    seats: w.seats ?? w.member_count ?? null,
    created_at: w.created_at,
  }));
}

export async function createPartnerWorkspace(input: { name: string; template_key: string; region: RegionSettings; branding?: Partial<Branding>; owner?: { name: string; phone: string; role?: WorkspaceRole } }) {
  const r = await api.post<Raw>('/partner/workspaces', { ...input, ...input.region, locale: 'en' }, { workspaceId: false });
  return adaptWorkspace(r.workspace);
}

/** TODO(backend): missing endpoint (only PATCH exists), served by MSW. */
export async function getPartnerBranding(): Promise<Branding> {
  const r = await api.get<Raw>('/partner/branding', undefined, { workspaceId: false });
  return adaptBrandingConfig(r.data ?? r.partner?.default_branding ?? {});
}

export async function updatePartnerBranding(branding: Partial<Branding>) {
  return api.patch<Raw>('/partner/branding', { branding, default_branding: branding }, { workspaceId: false });
}

/** TODO(backend): list/delete are missing endpoints, served by MSW. */
export async function listPartnerDomains(): Promise<PartnerDomain[]> {
  return (await api.get<Raw>('/partner/domains', undefined, { workspaceId: false })).data;
}

export async function addPartnerDomain(domain: string): Promise<PartnerDomain> {
  const r = await api.post<Raw>('/partner/domains', { domain }, { workspaceId: false });
  const d = r.partner_domain;
  return { id: d.id, domain: d.domain, verified: d.verified, dns: d.dns ?? null };
}

export async function deletePartnerDomain(id: string) {
  return api.delete<Raw>(`/partner/domains/${id}`, undefined, { workspaceId: false });
}
