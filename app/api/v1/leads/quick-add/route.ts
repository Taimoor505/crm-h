import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { elevate } from '@/server/db';
import { env } from '@/server/env';
import { ApiError, json, userRoute } from '@/server/http';
import { logActivity } from '@/server/core/contacts';
import { ingestLead } from '@/server/leads/ingest';
import { storage } from '@/server/storage';

const schema = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().min(5).max(30),
  email: z.email().optional(),
  note: z.string().trim().max(5000).optional(),
  /** 'me' (default), a user id (managers), or 'auto' to apply the assignment rules (managers). */
  assign_to: z.union([z.enum(['me', 'auto']), z.uuid()]).default('me'),
  source_label: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/).default('manual'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

const MAX_VOICE_BYTES = 10 * 1024 * 1024;

async function readInput(req: Request): Promise<{ fields: unknown; voice: File | null }> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const voice = form.get('voice');
    const fields: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      if (k === 'voice' || typeof v !== 'string' || v === '') continue;
      fields[k] = k === 'tags' ? v.split(',').map((t) => t.trim()).filter(Boolean) : v;
    }
    return { fields, voice: voice instanceof File && voice.size > 0 ? voice : null };
  }
  try {
    const text = await req.text();
    return { fields: text ? JSON.parse(text) : {}, voice: null };
  } catch {
    throw new ApiError(400, 'bad_json', 'Body must be valid JSON or multipart/form-data');
  }
}

/**
 * POST /leads/quick-add: an agent types a name and number (and optionally
 * records a voice note) right after a walk-in or phone call.
 * Duplicate phone: no new contact; it's logged as a re-enquiry instead.
 */
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const { fields, voice } = await readInput(req);
  const body = schema.parse(fields);

  if (voice) {
    if (!voice.type.startsWith('audio/')) throw new ApiError(422, 'invalid_voice', 'Voice note must be audio');
    if (voice.size > MAX_VOICE_BYTES) throw new ApiError(413, 'too_large', 'Voice note over 10 MB');
  }
  if (body.assign_to !== 'me' && body.assign_to !== userId && !isManager) {
    throw new ApiError(403, 'forbidden', 'Agents can only add leads for themselves');
  }

  if (body.assign_to !== 'me' && body.assign_to !== 'auto') {
    const [m] = await tx`select 1 from public.memberships
                          where workspace_id = ${workspace.id} and user_id = ${body.assign_to} and status = 'active'`;
    if (!m) throw new ApiError(422, 'invalid_assignee', 'Assignee is not an active member of this workspace');
  }

  // Permission checks done; duplicate detection must see every contact.
  await elevate(tx);
  const directOwnerId = body.assign_to === 'me' ? userId : body.assign_to === 'auto' ? null : body.assign_to;

  const result = await ingestLead(tx, {
    workspaceId: workspace.id,
    source: { id: null, name: 'Quick add', source_label: body.source_label },
    lead: {
      name: body.name ?? null,
      phone: body.phone,
      email: body.email ?? null,
      notes: body.note ?? null,
      custom: {},
      tags: body.tags,
    },
    actorId: userId,
    directOwnerId,
  });

  let voiceNotePath: string | null = null;
  if (voice) {
    const ext = (voice.type.split('/')[1] ?? 'webm').replace(/[^a-z0-9]/g, '') || 'webm';
    const uploaded = await storage().upload(
      env.voiceNotesBucket,
      `${workspace.id}/${result.contact.id}/${randomUUID()}.${ext}`,
      voice,
      voice.type,
    );
    voiceNotePath = uploaded.path;
    await logActivity(tx, {
      workspaceId: workspace.id,
      contactId: result.contact.id,
      type: 'note',
      actorId: userId,
      body: 'Voice note',
      meta: { voice_note_path: voiceNotePath, mime: voice.type, size: voice.size, counts_as_response: false },
    });
  }

  const visible = isManager || result.ownerId === userId;
  return json(
    {
      data: {
        contact_id: result.contact.id,
        status: result.status,
        owner_id: result.ownerId,
        voice_note_path: voiceNotePath,
        contact: visible
          ? { id: result.contact.id, name: result.contact.name, phone_e164: result.contact.phone_e164,
              owner_id: result.ownerId, source: result.contact.source }
          : null,
      },
    },
    result.status === 'created' ? 201 : 200,
  );
});
