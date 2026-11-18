import { jsonb, type Db } from '../db';
import { ApiError } from '../http';
import { normalizePhone } from '../core/phone';
import { createOrGetContact, logActivity, type Contact } from '../core/contacts';
import { assignContact, routeLead } from '../assignment/engine';
import { enqueue } from '../queue';
import type { MappedLead } from './mapping';

export interface IngestSource {
  id: string | null;            // lead_sources.id (null for built-in quick-add)
  name: string;                 // shown in the timeline: "New lead via <name>"
  source_label: string;         // stored in contacts.source
  default_tags?: string[];
}

export interface IngestResult {
  contact: Contact;
  status: 'created' | 'reenquiry';
  ownerId: string | null;
}

/**
 * The one path every lead takes into the CRM, whatever the source.
 *
 * - New phone: creates the contact (via the core contact service).
 * - Known phone: no new contact. Logs "Re-enquired via X" and treats it as a
 *   fresh lead for assignment and follow-up (untouched clock restarts).
 * - Then assigns: `directOwnerId` (quick-add) or the workspace's rules.
 * - Emits `lead.received` for automations (auto follow-up etc.).
 *
 * Must run as service_role: duplicate detection needs to see every contact in
 * the workspace, including ones owned by other agents.
 */
export async function ingestLead(
  tx: Db,
  args: {
    workspaceId: string;
    source: IngestSource;
    lead: MappedLead;
    actorId?: string | null;
    directOwnerId?: string | null;
    leadEventId?: string | null;
  },
): Promise<IngestResult> {
  const { workspaceId, source, lead } = args;
  const phone = normalizePhone(lead.phone);
  // Contacts are keyed by phone in the core schema, so a lead needs one.
  if (lead.phone && !phone) {
    throw new ApiError(422, 'invalid_phone', `"${lead.phone}" is not a valid phone number`);
  }
  if (!phone) {
    throw new ApiError(422, 'missing_phone', 'A lead needs a phone number');
  }

  const tags = [...new Set([...(source.default_tags ?? []), ...lead.tags])];
  const { contact: found, created } = await createOrGetContact(tx, {
    workspaceId,
    name: lead.name,
    phoneE164: phone,
    email: lead.email,
    source: source.source_label,
    tags,
    custom: lead.custom,
  });

  // Mark the enquiry. On a re-enquiry, fill gaps from the new payload without
  // overwriting what the team already knows (a name that is just the phone
  // number counts as a gap).
  const [contact] = await tx<Contact[]>`
    update public.contacts
       set last_enquiry_at = now(),
           auto_reassign_count = 0,
           name = case when (name = phone_e164 or name = '') and ${lead.name}::text is not null
                       then ${lead.name} else name end,
           email = coalesce(email, ${lead.email}),
           custom = ${jsonb(tx, lead.custom)}::jsonb || custom,
           tags = array(select distinct unnest(tags || ${tags}::text[])),
           updated_at = now()
     where id = ${found.id}
    returning *`;

  const meta = {
    kind: created ? 'lead_received' : 're_enquiry',
    lead_source_id: source.id,
    source_label: source.source_label,
    lead_event_id: args.leadEventId ?? null,
    counts_as_response: false,
  };
  await logActivity(tx, {
    workspaceId,
    contactId: contact.id,
    type: 'system',
    actorId: args.actorId ?? null,
    body: created ? `New lead via ${source.name}` : `Re-enquired via ${source.name}`,
    meta,
  });
  if (lead.notes) {
    await logActivity(tx, {
      workspaceId,
      contactId: contact.id,
      type: 'note',
      actorId: args.actorId ?? null,
      body: lead.notes,
      meta: { ...meta, kind: 'lead_message' },
    });
  }

  let ownerId: string | null;
  if (args.directOwnerId && (created || !contact.owner_id)) {
    await assignContact(tx, {
      contact,
      toUserId: args.directOwnerId,
      actorId: args.actorId ?? null,
      reason: args.directOwnerId === args.actorId ? 'self' : 'manual',
      sourceName: source.name,
    });
    ownerId = args.directOwnerId;
  } else {
    ownerId = await routeLead(tx, {
      contact,
      isReenquiry: !created,
      sourceLabel: source.source_label,
      sourceName: source.name,
      leadSourceId: source.id,
    });
  }

  await enqueue(
    tx,
    'lead.received',
    {
      contact_id: contact.id,
      workspace_id: workspaceId,
      status: created ? 'created' : 'reenquiry',
      source_label: source.source_label,
      lead_source_id: source.id,
      owner_id: ownerId,
    },
    { workspaceId, dedupeKey: args.leadEventId ? `lead.received:${args.leadEventId}` : undefined },
  );

  return { contact: { ...contact, owner_id: ownerId }, status: created ? 'created' : 'reenquiry', ownerId };
}

/**
 * For contacts created outside lead capture that are still leads, i.e.
 * Taimoor's inbound WhatsApp webhook (contact.created with source whatsapp).
 * Called by the worker; does nothing if the contact was already handled.
 */
export async function registerInboundContact(tx: Db, contactId: string): Promise<boolean> {
  const [contact] = await tx<Contact[]>`
    select * from public.contacts where id = ${contactId} and last_enquiry_at is null for update`;
  // Taimoor's WhatsApp webhook uses source 'WhatsApp Inbound'.
  if (!contact || !/whatsapp/i.test(contact.source ?? '')) return false;

  await tx`update public.contacts set last_enquiry_at = coalesce(last_enquiry_at, created_at)
           where id = ${contact.id}`;
  await logActivity(tx, {
    workspaceId: contact.workspace_id,
    contactId: contact.id,
    type: 'system',
    body: 'New lead via WhatsApp',
    meta: { kind: 'lead_received', source_label: 'whatsapp', counts_as_response: false },
  });
  const ownerId = contact.owner_id
    ?? (await routeLead(tx, { contact, isReenquiry: false, sourceLabel: 'whatsapp', sourceName: 'WhatsApp' }));
  // Same event as other sources, so automations (welcome, auto follow-up) apply.
  await enqueue(tx, 'lead.received', {
    contact_id: contact.id, workspace_id: contact.workspace_id, status: 'created',
    source_label: 'whatsapp', lead_source_id: null, owner_id: ownerId,
  }, { workspaceId: contact.workspace_id, dedupeKey: `lead.received:contact:${contact.id}` });
  return true;
}
