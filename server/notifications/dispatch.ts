import type { Db } from '../db';
import { enqueue } from '../queue';
import { normalizePhone } from '../core/phone';
import { whatsapp } from '../core/whatsapp';
import { push } from '../channels/push';
import { recordWhatsAppUsage } from '../usage';
import { channelEnabled, type Channel } from './events';

interface NotificationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  priority: 'normal' | 'urgent';
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  timezone: string;
  channels: Record<string, Partial<Record<Channel, boolean>>> | null;
  quiet_hours: boolean | null;
  whatsapp_number: string | null;
  user_phone: string | null;
}

const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Worker step 1 ('notification.dispatch'): decide which channels a
 * notification goes to and when, and queue one delivery per channel.
 * Idempotent: one delivery row per (notification, channel).
 */
export async function dispatchNotification(tx: Db, notificationId: string): Promise<Channel[]> {
  const [n] = await tx<NotificationRow[]>`
    select n.id, n.workspace_id, n.user_id, n.type, n.priority, n.title, n.body, n.data,
           w.timezone, s.channels, s.quiet_hours, s.whatsapp_number, u.phone as user_phone
      from public.notifications n
      join public.workspaces w on w.id = n.workspace_id
      join public.users u on u.id = n.user_id
      left join public.notification_settings s on s.workspace_id = n.workspace_id and s.user_id = n.user_id
     where n.id = ${notificationId}`;
  if (!n) return [];

  const queued: Channel[] = [];
  for (const channel of ['push', 'whatsapp'] as Channel[]) {
    if (!channelEnabled(n.type, channel, n.channels)) continue;

    let skipReason: string | null = null;
    if (channel === 'push') {
      const [{ count }] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.push_subscriptions
         where user_id = ${n.user_id} and disabled_at is null`;
      if (count === 0) skipReason = 'no push subscription';
    } else if (!normalizePhone(n.whatsapp_number ?? n.user_phone)) {
      skipReason = 'no WhatsApp number';
    }

    const quiet = n.quiet_hours ?? true;
    const [d] = await tx<{ id: string; scheduled_for: Date }[]>`
      insert into public.notification_deliveries (notification_id, channel, status, error, scheduled_for)
      values (${n.id}, ${channel}, ${skipReason ? 'skipped' : 'queued'}, ${skipReason},
              case when ${quiet}::boolean then public.quiet_hours_release(${n.timezone}) else now() end)
      on conflict (notification_id, channel) do nothing
      returning id, scheduled_for`;
    if (!d || skipReason) continue;

    await enqueue(tx, 'notification.deliver', { delivery_id: d.id }, {
      workspaceId: n.workspace_id,
      runAt: d.scheduled_for,
      dedupeKey: `notification.deliver:${d.id}`,
    });
    queued.push(channel);
  }
  return queued;
}

/**
 * Worker step 2 ('notification.deliver'): send one delivery. Up to 3 attempts,
 * then the delivery is marked failed (the send log keeps the last error).
 */
export async function deliverNotification(tx: Db, deliveryId: string): Promise<string> {
  const [d] = await tx<(NotificationRow & { delivery_id: string; channel: Channel; status: string; attempts: number })[]>`
    select d.id as delivery_id, d.channel, d.status, d.attempts,
           n.id, n.workspace_id, n.user_id, n.type, n.priority, n.title, n.body, n.data,
           s.whatsapp_number, u.phone as user_phone
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      join public.users u on u.id = n.user_id
      left join public.notification_settings s on s.workspace_id = n.workspace_id and s.user_id = n.user_id
     where d.id = ${deliveryId}
       for update of d`;
  if (!d || d.status !== 'queued') return 'already handled';

  try {
    let providerRef: string | null = null;
    if (d.channel === 'push') {
      const subs = await tx<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
        select id, endpoint, p256dh, auth from public.push_subscriptions
         where user_id = ${d.user_id} and disabled_at is null`;
      let sent = 0;
      let lastError: unknown = null;
      for (const s of subs) {
        try {
          const r = await push().send(s, {
            title: d.title,
            body: d.body,
            tag: d.type,
            url: deepLink(d.data),
            data: { notification_id: d.id, type: d.type, ...d.data },
          }, d.priority === 'urgent');
          if (r === 'gone') {
            await tx`update public.push_subscriptions set disabled_at = now() where id = ${s.id}`;
          } else {
            sent++;
            await tx`update public.push_subscriptions set last_success_at = now() where id = ${s.id}`;
          }
        } catch (err) {
          lastError = err;
        }
      }
      if (sent === 0) {
        if (lastError) throw lastError;
        await tx`update public.notification_deliveries
                    set status = 'skipped', error = 'no active push subscription', updated_at = now()
                  where id = ${deliveryId}`;
        return 'skipped';
      }
      providerRef = `${sent} device(s)`;
    } else {
      const to = normalizePhone(d.whatsapp_number ?? d.user_phone);
      if (!to) {
        await tx`update public.notification_deliveries set status = 'skipped', error = 'no WhatsApp number',
                   updated_at = now() where id = ${deliveryId}`;
        return 'skipped';
      }
      const { messageId } = await whatsapp().sendTemplate({
        workspaceId: null,
        to,
        template: process.env.WHATSAPP_AGENT_ALERT_TEMPLATE ?? 'agent_alert',
        language: 'en',
        params: [d.title, d.body ?? ''],
      });
      providerRef = messageId;
      await recordWhatsAppUsage(tx, d.workspace_id, 1);
    }

    await tx`update public.notification_deliveries
                set status = 'sent', provider_ref = ${providerRef}, sent_at = now(),
                    attempts = attempts + 1, error = null, updated_at = now()
              where id = ${deliveryId}`;
    return 'sent';
  } catch (err) {
    const attempts = d.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    await tx`update public.notification_deliveries
                set attempts = ${attempts}, error = ${message.slice(0, 1000)},
                    status = ${attempts >= MAX_DELIVERY_ATTEMPTS ? 'failed' : 'queued'}, updated_at = now()
              where id = ${deliveryId}`;
    if (attempts >= MAX_DELIVERY_ATTEMPTS) return 'failed';
    // Retry as a new job (1 min, then 4 min). Not by throwing: that would roll
    // back the attempt count recorded above.
    await enqueue(tx, 'notification.deliver', { delivery_id: deliveryId }, {
      workspaceId: d.workspace_id,
      runAt: new Date(Date.now() + 60_000 * 4 ** (attempts - 1)),
      dedupeKey: `notification.deliver:${deliveryId}:retry${attempts}`,
    });
    return 'retrying';
  }
}

function deepLink(data: Record<string, unknown>): string {
  if (typeof data.task_id === 'string') return `/tasks/${data.task_id}`;
  if (typeof data.contact_id === 'string') return `/contacts/${data.contact_id}`;
  if (typeof data.deal_id === 'string') return `/deals/${data.deal_id}`;
  return '/';
}
