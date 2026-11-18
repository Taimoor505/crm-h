import { z } from 'zod';
import { jsonb } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { normalizePhone } from '@/server/core/phone';
import { channelEnabled, EVENT_TYPES } from '@/server/notifications/events';
import type { Db } from '@/server/db';

interface SettingsRow {
  channels: Record<string, { push?: boolean; whatsapp?: boolean }>;
  quiet_hours: boolean;
  whatsapp_number: string | null;
}

async function present(tx: Db, workspaceId: string, userId: string) {
  const [row] = await tx<SettingsRow[]>`
    select channels, quiet_hours, whatsapp_number from public.notification_settings
     where workspace_id = ${workspaceId} and user_id = ${userId}`;
  const [u] = await tx<{ phone: string | null }[]>`select phone from public.users where id = ${userId}`;
  const [{ devices }] = await tx<{ devices: number }[]>`
    select count(*)::int as devices from public.push_subscriptions where user_id = ${userId} and disabled_at is null`;
  return {
    events: Object.entries(EVENT_TYPES).map(([type, def]) => ({
      type,
      label: def.label,
      in_app: true,
      push: channelEnabled(type, 'push', row?.channels),
      whatsapp: channelEnabled(type, 'whatsapp', row?.channels),
    })),
    quiet_hours: row?.quiet_hours ?? true,
    quiet_hours_window: '23:00-08:00',
    whatsapp_number: row?.whatsapp_number ?? null,
    whatsapp_number_effective: normalizePhone(row?.whatsapp_number ?? u?.phone),
    push: { vapid_public_key: process.env.VAPID_PUBLIC_KEY ?? null, devices },
  };
}

// GET /notification-settings: the caller's channels per event type.
export const GET = userRoute({}, async ({ tx, workspace, userId }) =>
  json({ data: await present(tx, workspace.id, userId) }));

const eventKeys = Object.keys(EVENT_TYPES) as [string, ...string[]];
const putSchema = z.object({
  events: z
    .array(z.object({ type: z.enum(eventKeys), push: z.boolean().optional(), whatsapp: z.boolean().optional() }))
    .max(50)
    .optional(),
  quiet_hours: z.boolean().optional(),
  whatsapp_number: z.string().trim().max(30).nullable().optional(),
});

// PUT /notification-settings: partial update; only the given event types change.
export const PUT = userRoute({}, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, putSchema);
  let number: string | null | undefined = undefined;
  if (body.whatsapp_number !== undefined) {
    number = body.whatsapp_number ? normalizePhone(body.whatsapp_number) : null;
    if (body.whatsapp_number && !number) throw new ApiError(422, 'invalid_phone', 'Not a valid WhatsApp number');
  }

  const [current] = await tx<SettingsRow[]>`
    select channels, quiet_hours, whatsapp_number from public.notification_settings
     where workspace_id = ${workspace.id} and user_id = ${userId} for update`;
  const channels = { ...(current?.channels ?? {}) };
  for (const e of body.events ?? []) {
    channels[e.type] = {
      ...channels[e.type],
      ...(e.push !== undefined ? { push: e.push } : {}),
      ...(e.whatsapp !== undefined ? { whatsapp: e.whatsapp } : {}),
    };
  }

  await tx`
    insert into public.notification_settings (workspace_id, user_id, channels, quiet_hours, whatsapp_number)
    values (${workspace.id}, ${userId}, ${jsonb(tx, channels)}::jsonb,
            ${body.quiet_hours ?? current?.quiet_hours ?? true},
            ${number === undefined ? (current?.whatsapp_number ?? null) : number})
    on conflict (workspace_id, user_id) do update set
      channels = excluded.channels, quiet_hours = excluded.quiet_hours,
      whatsapp_number = excluded.whatsapp_number, updated_at = now()`;
  return json({ data: await present(tx, workspace.id, userId) });
});
