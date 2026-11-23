// Contact service shared by lead capture, imports and the contacts routes,
// on the core schema (001_core_schema.sql). Behaviour to keep: dedupe on
// (workspace_id, phone_e164) among live contacts, emit contact.created
// exactly once, write activities for the timeline.
import { jsonb, type Db } from '../db';
import { enqueue } from '../queue';

export interface Contact {
  id: string;
  workspace_id: string;
  name: string | null;
  phone_e164: string | null;
  email: string | null;
  source: string | null;
  owner_id: string | null;
  status: string;
  tags: string[];
  custom: Record<string, unknown>;
  created_at: Date;
  deleted_at: Date | null;
  first_response_at: Date | null;
  last_response_at: Date | null;
  last_enquiry_at: Date | null;
  assigned_at: Date | null;
  auto_reassign_count: number;
}

export interface NewContact {
  workspaceId: string;
  /** Falls back to the phone number (contacts.name is required). */
  name?: string | null;
  phoneE164: string;
  email?: string | null;
  source: string;
  ownerId?: string | null;
  tags?: string[];
  custom?: Record<string, unknown>;
}

/**
 * Creates a contact, or returns the existing one with the same phone.
 * Race-safe: two simultaneous enquiries from one number create one contact.
 * Must run with a role that can see every contact in the workspace (service).
 */
export async function createOrGetContact(
  tx: Db,
  input: NewContact,
): Promise<{ contact: Contact; created: boolean }> {
  const [inserted] = await tx<Contact[]>`
    insert into public.contacts
      (workspace_id, name, phone_e164, email, source, owner_id, tags, custom, last_activity_at)
    values (${input.workspaceId}, ${input.name || input.phoneE164}, ${input.phoneE164},
            ${input.email ?? null}, ${input.source}, ${input.ownerId ?? null},
            ${input.tags ?? []}::text[], ${jsonb(tx, input.custom ?? {})}::jsonb, now())
    on conflict (workspace_id, phone_e164) where deleted_at is null do nothing
    returning *`;

  if (inserted) {
    await enqueue(
      tx,
      'contact.created',
      { contact_id: inserted.id, workspace_id: inserted.workspace_id, source: inserted.source },
      { workspaceId: inserted.workspace_id, dedupeKey: `contact.created:${inserted.id}` },
    );
    return { contact: inserted, created: true };
  }

  const [existing] = await tx<Contact[]>`
    select * from public.contacts
     where workspace_id = ${input.workspaceId} and phone_e164 = ${input.phoneE164} and deleted_at is null`;
  if (!existing) throw new Error('contact insert conflicted but no existing row was found');
  return { contact: existing, created: false };
}

export interface NewActivity {
  workspaceId: string;
  contactId?: string | null;
  dealId?: string | null;
  type: 'note' | 'call' | 'whatsapp' | 'stage_change' | 'assignment' | 'task' | 'system';
  actorId?: string | null;
  body?: string | null;
  meta?: Record<string, unknown>;
}

export async function logActivity(tx: Db, a: NewActivity): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into public.activities (workspace_id, contact_id, deal_id, type, actor_id, body, meta)
    values (${a.workspaceId}, ${a.contactId ?? null}, ${a.dealId ?? null}, ${a.type},
            ${a.actorId ?? null}, ${a.body ?? ''}, ${jsonb(tx, a.meta ?? {})}::jsonb)
    returning id`;
  return row.id;
}
