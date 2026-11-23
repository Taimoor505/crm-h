import { api } from '../client';
import {
  adaptActivity, adaptContact, adaptDeal, adaptField, adaptMember, adaptPipeline, adaptStage, type Raw,
} from '../adapters';
import { toMinor } from '@/lib/format';
import type { SignInAs } from '@/lib/auth/session';
import type {
  Activity, CallOutcome, Contact, ContactSummary, CustomFieldDef, CustomFieldType, Deal, DuplicateCheck, Page, Pipeline,
  ReasonPresets, Stage, StageKind, TeamMember, WorkspaceRole,
} from '../types';

// ------------------------------------------------------------- contacts

export interface ContactFilters {
  q?: string;
  source?: string;
  owner?: string;
  tag?: string;
  status?: string;
  stage?: string;
  /** Leads added in the last N days. */
  created_within_days?: string;
  /** 'true': still waiting for a reply to their latest enquiry. */
  awaiting?: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: ContactFilters;
  shared: boolean;
  user_id: string;
}

export async function listSavedViews(): Promise<SavedView[]> {
  return (await api.get<Raw>('/saved-views')).data;
}

export async function createSavedView(input: { name: string; filters: ContactFilters; shared: boolean }): Promise<SavedView> {
  return (await api.post<Raw>('/saved-views', input)).data;
}

export async function deleteSavedView(id: string) {
  await api.delete(`/saved-views/${id}`);
}

export async function listContacts(f: ContactFilters & { cursor?: string | null; limit?: number }): Promise<Page<Contact>> {
  const r = await api.get<Raw>('/contacts', { ...f, cursor: f.cursor ?? undefined, limit: f.limit ?? 50 });
  return { data: r.data.map(adaptContact), next_cursor: r.pagination?.next_cursor ?? null, total: r.pagination?.total_visible };
}

export async function getContact(id: string): Promise<Contact> {
  const r = await api.get<Raw>(`/contacts/${id}`);
  return adaptContact(r.contact);
}

export interface ContactPatch {
  name?: string;
  email?: string | null;
  status?: string;
  source?: string;
  tags?: string[];
  phone?: string;
  custom?: Record<string, unknown>;
}

export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  const r = await api.patch<Raw>(`/contacts/${id}`, patch);
  return adaptContact(r.contact);
}

export async function deleteContact(id: string) {
  await api.delete(`/contacts/${id}`);
}

export async function checkDuplicate(phoneE164: string, country?: string): Promise<DuplicateCheck> {
  // TODO(backend): `country` is ignored until phone normalisation is international (brief §12.2).
  const r = await api.get<Raw>('/contacts/check-duplicate', { phone: phoneE164, country });
  return {
    normalized_e164: r.normalized_e164 ?? null,
    duplicate: r.duplicate_found && r.existing_contact
      ? { id: r.existing_contact.id, name: r.existing_contact.name, phone_e164: r.existing_contact.phone_e164, owner_id: r.existing_contact.owner_id ?? null }
      : null,
  };
}

export interface QuickAddInput {
  name: string;
  phone: string;
  email?: string;
  note?: string;
  assign_to?: string;
  source_label?: string;
  tags?: string[];
  voice?: Blob | null;
}

export interface QuickAddResult {
  contact_id: string;
  status: 'created' | 'reenquiry' | 'queued';
  owner_id: string | null;
}

export async function quickAdd(input: QuickAddInput): Promise<QuickAddResult> {
  let r: Raw;
  if (input.voice) {
    const form = new FormData();
    for (const [k, v] of Object.entries(input)) {
      if (v == null || k === 'voice') continue;
      form.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    form.set('voice', input.voice, 'voice-note.webm');
    r = await api.post<Raw>('/leads/quick-add', undefined, { form });
  } else {
    const { voice: _voice, ...body } = input;
    r = await api.post<Raw>('/leads/quick-add', body);
  }
  return { contact_id: r.data.contact_id, status: r.data.status, owner_id: r.data.owner_id ?? null };
}

export async function assignContact(id: string, userId: string | null) {
  const r = await api.post<Raw>(`/contacts/${id}/assign`, { user_id: userId });
  return r.data as { contact_id: string; owner_id: string | null; changed: boolean };
}

export async function mergeContacts(primaryId: string, secondaryId: string): Promise<Contact> {
  const r = await api.post<Raw>(`/contacts/${primaryId}/merge`, { secondary_contact_id: secondaryId });
  return adaptContact(r.contact);
}

export async function getTimeline(id: string, cursor?: string | null): Promise<Page<Activity>> {
  const r = await api.get<Raw>(`/contacts/${id}/timeline`, { cursor: cursor ?? undefined, limit: 50 });
  return { data: r.data.map(adaptActivity), next_cursor: r.pagination?.next_cursor ?? null };
}

export async function addNote(contactId: string, body: string, dealId?: string): Promise<Activity> {
  const r = await api.post<Raw>(`/contacts/${contactId}/notes`, { body, deal_id: dealId });
  return adaptActivity(r.activity);
}

export async function logCall(contactId: string, input: { outcome: CallOutcome; note?: string; duration_sec?: number; deal_id?: string }): Promise<Activity> {
  const r = await api.post<Raw>(`/contacts/${contactId}/calls`, input);
  return adaptActivity(r.activity);
}

export async function exportCsv(entity: 'contacts' | 'deals') {
  const r = await api.post<Raw>('/exports', { entity });
  return { file_name: r.file_name as string, csv: r.csv_content as string, row_count: r.row_count as number };
}

// ------------------------------------------------------------- pipelines & deals

export async function listPipelines(): Promise<Pipeline[]> {
  const r = await api.get<Raw>('/pipelines');
  return r.data.map(adaptPipeline).sort((a: Pipeline, b: Pipeline) => a.position - b.position);
}

export async function createPipeline(name: string): Promise<Pipeline> {
  const r = await api.post<Raw>('/pipelines', { name });
  return adaptPipeline(r.pipeline);
}

export async function createStage(pipelineId: string, input: { name: string; kind: StageKind; position?: number }): Promise<Stage> {
  const r = await api.post<Raw>(`/pipelines/${pipelineId}/stages`, input);
  return adaptStage(r.stage);
}

export async function updateStage(pipelineId: string, stageId: string, patch: { name?: string; position?: number; kind?: StageKind }): Promise<Stage> {
  const r = await api.patch<Raw>(`/pipelines/${pipelineId}/stages`, { stage_id: stageId, ...patch });
  return adaptStage(r.stage);
}

/** TODO(backend): missing endpoint, served by MSW (docs/frontend-endpoint-map.md). */
export async function deleteStage(pipelineId: string, stageId: string, moveTo: string) {
  return api.delete<Raw>(`/pipelines/${pipelineId}/stages/${stageId}`, undefined, { query: { move_to: moveTo } });
}

/** TODO(backend): missing endpoint, served by MSW. */
export async function getReasons(pipelineId: string): Promise<ReasonPresets> {
  const r = await api.get<Raw>(`/pipelines/${pipelineId}/reasons`);
  return r.data;
}

export async function saveReasons(pipelineId: string, reasons: ReasonPresets): Promise<ReasonPresets> {
  const r = await api.put<Raw>(`/pipelines/${pipelineId}/reasons`, reasons);
  return r.data;
}

/** Loads every deal of a pipeline (the API pages at 100). */
export async function listDeals(f: { pipeline_id?: string; stage_id?: string; contact_id?: string } = {}): Promise<Deal[]> {
  const out: Deal[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await api.get<Raw>('/deals', { pipeline_id: f.pipeline_id, stage_id: f.stage_id, contact_id: f.contact_id, cursor, limit: 100 });
    out.push(...r.data.map(adaptDeal));
    cursor = r.pagination?.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return f.contact_id ? out.filter((d) => d.contact_id === f.contact_id) : out;
}

export interface DealInput {
  contact_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  /** Major units in the workspace currency. */
  amount?: number | null;
  currency: string;
  expected_close?: string | null;
  owner_id?: string;
}

export async function createDeal(input: DealInput): Promise<Deal> {
  const { amount, currency, ...rest } = input;
  const r = await api.post<Raw>('/deals', {
    ...rest,
    // TODO(money): send value_minor + currency only, once the backend takes them (brief §12.3).
    value_minor: amount != null ? toMinor(amount, currency) : null,
    currency,
    value_pkr: amount ?? 0,
  });
  return adaptDeal(r.deal);
}

export async function updateDeal(id: string, patch: Partial<Omit<DealInput, 'contact_id'>>): Promise<Deal> {
  const { amount, currency, ...rest } = patch;
  const body: Raw = { ...rest };
  if (amount !== undefined && currency) {
    body.value_minor = amount != null ? toMinor(amount, currency) : null;
    body.currency = currency;
    body.value_pkr = amount ?? 0;
  }
  const r = await api.patch<Raw>(`/deals/${id}`, body);
  return adaptDeal(r.deal);
}

export async function moveDeal(id: string, stageId: string, reason?: { lost_reason?: string; won_reason?: string }): Promise<Deal> {
  const r = await api.post<Raw>(`/deals/${id}/move`, { stage_id: stageId, ...reason });
  return adaptDeal(r.deal);
}

// ------------------------------------------------------------- custom fields

export async function listFields(entity?: 'contact' | 'deal'): Promise<CustomFieldDef[]> {
  const r = await api.get<Raw>('/custom-fields', { entity });
  return r.data.map(adaptField).sort((a: CustomFieldDef, b: CustomFieldDef) => a.position - b.position);
}

export interface FieldInput {
  entity: 'contact' | 'deal';
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
}

export async function createField(input: FieldInput): Promise<CustomFieldDef> {
  // TODO(backend): label_ur stays required by the sandbox; send the English label (brief §12.4).
  const r = await api.post<Raw>('/custom-fields', { ...input, label_en: input.label, label_ur: input.label });
  return adaptField(r.custom_field);
}

export async function updateField(id: string, patch: Partial<{ label: string; options: string[]; required: boolean; hidden: boolean; position: number }>): Promise<CustomFieldDef> {
  const body: Raw = { ...patch };
  if (patch.label !== undefined) body.label_en = patch.label;
  const r = await api.patch<Raw>(`/custom-fields/${id}`, body);
  return adaptField(r.custom_field);
}

// ------------------------------------------------------------- team

export async function listMembers(workspaceId: string): Promise<TeamMember[]> {
  const r = await api.get<Raw>(`/workspaces/${workspaceId}/members`, undefined, { workspaceId });
  return r.data.map(adaptMember);
}

export async function invite(input: { name: string; phone?: string; email?: string; role: WorkspaceRole }) {
  const r = await api.post<Raw>('/invites', input);
  return r.membership as Raw;
}

export async function updateMembership(id: string, patch: { role?: WorkspaceRole; status?: 'active' | 'suspended' }) {
  const r = await api.patch<Raw>(`/memberships/${id}`, patch);
  return r.membership as Raw;
}

/** "Sign in as" (owners): start working as a manager or agent of this workspace. */
export async function startSignInAs(workspaceId: string, userId: string): Promise<SignInAs> {
  const r = (await api.post<Raw>(`/workspaces/${workspaceId}/sign-in-as`, { user_id: userId }, { workspaceId })).sign_in_as;
  return { id: r.id, workspaceId, userId: r.user.id, name: r.user.name || r.user.email || '', role: r.user.role, expiresAt: r.expires_at };
}

/** "Return to my account". The server runs this as the owner even with the header attached. */
export async function endSignInAs(workspaceId: string) {
  await api.delete(`/workspaces/${workspaceId}/sign-in-as`, undefined, { workspaceId });
}

export async function getContactSummary(id: string): Promise<ContactSummary> {
  const d = (await api.get<Raw>(`/contacts/${id}/summary`)).data;
  const cur = d.deals.currency;
  return {
    ...d,
    deals: {
      ...d.deals,
      open_value: { amount_minor: d.deals.open_value_minor, currency: cur },
      won_value: { amount_minor: d.deals.won_value_minor, currency: cur },
    },
  };
}
