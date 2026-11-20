import type { Db } from '../db';
import { ApiError } from '../http';

/** Response shapes for the core CRM records (match mocks/handlers/all.ts). */

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null) ?? null);

export interface ContactRow {
  id: string; workspace_id: string; name: string; phone_e164: string; alt_phone: string | null; email: string | null;
  source: string; owner_id: string | null; status: string; tags: string[]; custom: Record<string, unknown>;
  last_activity_at: Date; created_at: Date; updated_at: Date; deleted_at: Date | null; last_enquiry_at: Date | null;
  first_response_at: Date | null; last_response_at: Date | null; is_sample: boolean; company_id?: string | null;
}

export function contactOut(c: ContactRow) {
  return {
    id: c.id, workspace_id: c.workspace_id, name: c.name, phone_e164: c.phone_e164, alt_phone: c.alt_phone,
    email: c.email, source: c.source, owner_id: c.owner_id, status: c.status, tags: c.tags ?? [], custom: c.custom ?? {},
    last_activity_at: iso(c.last_activity_at), created_at: iso(c.created_at), updated_at: iso(c.updated_at),
    deleted_at: iso(c.deleted_at), last_enquiry_at: iso(c.last_enquiry_at), first_response_at: iso(c.first_response_at),
    last_response_at: iso(c.last_response_at), is_sample: c.is_sample,
  };
}

export interface DealRow {
  id: string; workspace_id: string; pipeline_id: string; stage_id: string; contact_id: string; title: string;
  value_minor: string | number; currency: string; owner_id: string | null; expected_close: string | Date | null;
  lost_reason: string | null; won_reason: string | null; custom: Record<string, unknown>; stage_entered_at: Date;
  created_at: Date; updated_at: Date; deleted_at: Date | null; is_sample: boolean;
  next_task_due_at?: Date | null; contact_name?: string | null; contact_phone?: string | null;
}

export function dealOut(d: DealRow) {
  const close = d.expected_close instanceof Date ? d.expected_close.toISOString().slice(0, 10) : d.expected_close;
  return {
    id: d.id, workspace_id: d.workspace_id, pipeline_id: d.pipeline_id, stage_id: d.stage_id, contact_id: d.contact_id,
    title: d.title, value_minor: Number(d.value_minor), currency: d.currency, owner_id: d.owner_id, expected_close: close,
    lost_reason: d.lost_reason, won_reason: d.won_reason, custom: d.custom ?? {}, stage_entered_at: iso(d.stage_entered_at),
    created_at: iso(d.created_at), updated_at: iso(d.updated_at), next_task_due_at: iso(d.next_task_due_at ?? null),
    is_sample: d.is_sample,
    contact: d.contact_name !== undefined ? { id: d.contact_id, name: d.contact_name, phone_e164: d.contact_phone ?? null } : null,
  };
}

/** Deal columns plus the contact and the next open follow-up. Use as `${dealSelect(tx)} where ...`. */
export function dealSelect(tx: Db) {
  return tx`
    select d.*, c.name as contact_name, c.phone_e164 as contact_phone,
           (select min(t.due_at) from public.tasks t
             where t.workspace_id = d.workspace_id and t.status = 'open'
               and (t.deal_id = d.id or (t.deal_id is null and t.contact_id = d.contact_id))) as next_task_due_at
      from public.deals d
      join public.contacts c on c.id = d.contact_id`;
}

export interface ActivityRow {
  id: string; workspace_id: string; contact_id: string | null; deal_id: string | null; type: string;
  actor_id: string | null; body: string; meta: Record<string, unknown>; created_at: Date;
}
export function activityOut(a: ActivityRow) {
  return { ...a, created_at: iso(a.created_at) };
}

/** Loads a live contact the caller may see (agents: their own), or throws 404/403. */
export async function visibleContact(tx: Db, workspaceId: string, id: string, userId: string, isManager: boolean): Promise<ContactRow> {
  const [c] = await tx<ContactRow[]>`
    select * from public.contacts where id = ${id} and workspace_id = ${workspaceId} and deleted_at is null`;
  if (!c) throw new ApiError(404, 'not_found', 'Contact not found');
  if (!isManager && c.owner_id !== userId) throw new ApiError(403, 'forbidden', 'This lead belongs to someone else');
  return c;
}

/** Marks that someone on the team responded to the lead (speed-to-lead). */
export async function markResponded(tx: Db, contactId: string) {
  await tx`
    update public.contacts
       set first_response_at = coalesce(first_response_at, now()), last_response_at = now(),
           last_activity_at = now(), updated_at = now()
     where id = ${contactId}`;
}

export const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost', 'cold', 'open'] as const;

/** Validates custom field values against the workspace's definitions. */
export async function cleanCustom(tx: Db, workspaceId: string, entity: 'contact' | 'deal', input: unknown): Promise<Record<string, unknown>> {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new ApiError(422, 'validation_failed', 'custom must be an object');
  const defs = await tx<{ key: string; type: string; options: string[]; label_en: string }[]>`
    select key, type, options, label_en from public.custom_field_defs where workspace_id = ${workspaceId} and entity = ${entity}`;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const def = defs.find((d) => d.key === k);
    if (!def) continue;
    if (v === null || v === '') {
      out[k] = null;
      continue;
    }
    const bad = () => new ApiError(422, 'validation_failed', `${def.label_en} is not valid`, [{ path: `custom.${k}`, message: 'invalid' }]);
    switch (def.type) {
      case 'number': case 'money': case 'area':
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
        out[k] = v;
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) throw bad();
        out[k] = v;
        break;
      case 'select':
        if (typeof v !== 'string' || (def.options.length && !def.options.includes(v))) throw bad();
        out[k] = v;
        break;
      case 'multiselect':
        if (!Array.isArray(v)) throw bad();
        out[k] = v.map(String);
        break;
      case 'boolean':
        out[k] = Boolean(v);
        break;
      default:
        out[k] = String(v).slice(0, 2000);
    }
  }
  return out;
}
