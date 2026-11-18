/**
 * Every notification type, with its default channels. In-app is always on.
 * Users override push / WhatsApp per type in notification_settings.channels.
 * WhatsApp to the agent is reserved for urgent items (new lead, overdue
 * follow-up) by default, because each one costs money.
 */
export interface EventTypeDef {
  label: string;
  push: boolean;
  whatsapp: boolean;
}

export const EVENT_TYPES = {
  'lead.assigned': { label: 'New lead assigned to me', push: true, whatsapp: true },
  'lead.reenquired': { label: 'My lead enquired again', push: true, whatsapp: true },
  'lead.untouched': { label: 'New lead not contacted in 30 minutes', push: true, whatsapp: true },
  'lead.unassigned': { label: 'New lead needs an owner (managers)', push: true, whatsapp: false },
  'lead.reassigned_away': { label: 'Lead moved to a colleague', push: true, whatsapp: false },
  'task.assigned': { label: 'Task assigned to me', push: true, whatsapp: false },
  'task.reminder': { label: 'Follow-up due in 15 minutes', push: true, whatsapp: false },
  'task.overdue': { label: 'Follow-up overdue', push: true, whatsapp: true },
  'digest.overdue': { label: 'Daily overdue digest (managers)', push: true, whatsapp: false },
  'deal.stale': { label: 'Deal stuck in a stage', push: true, whatsapp: false },
  'deal.won': { label: 'Deal won by the team', push: true, whatsapp: false },
} as const satisfies Record<string, EventTypeDef>;

export type NotificationType = keyof typeof EVENT_TYPES;
export type Channel = 'push' | 'whatsapp';

export function channelEnabled(
  type: string,
  channel: Channel,
  overrides: Record<string, Partial<Record<Channel, boolean>>> | null | undefined,
): boolean {
  const o = overrides?.[type]?.[channel];
  if (typeof o === 'boolean') return o;
  const def = (EVENT_TYPES as Record<string, EventTypeDef>)[type];
  return def ? def[channel] : false;
}
