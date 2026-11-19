import type { JsonSchema } from '@/lib/api/types';

/** Mirrors server/automations/catalog.ts (names, triggers and settings as JSON Schema). */
export const AUTOMATION_CATALOG: { key: string; name: string; description: string; triggers: string[]; settings_schema: JsonSchema; defaults: Record<string, unknown> }[] = [
  {
    key: 'welcome_message',
    name: 'Welcome message',
    description: 'When a new lead arrives, send them a WhatsApp template.',
    triggers: ['lead.received'],
    settings_schema: {
      type: 'object',
      properties: {
        template_name: { type: 'string', title: 'WhatsApp template name', description: 'Lowercase letters, digits and underscores.', 'x-widget': 'whatsapp_template' },
        language: { type: 'string', title: 'Language', enum: ['en'], default: 'en' },
      },
    },
    defaults: { language: 'en' },
  },
  {
    key: 'auto_follow_up',
    name: 'Auto follow-up',
    description: 'When a lead arrives (or enquires again), create a call task for its owner due in X minutes.',
    triggers: ['lead.received'],
    settings_schema: {
      type: 'object',
      properties: {
        due_in_minutes: { type: 'integer', title: 'Due in', format: 'duration-minutes', minimum: 0, maximum: 10080, default: 15 },
        type: { type: 'string', title: 'Follow-up type', enum: ['call', 'whatsapp', 'meeting', 'site_visit', 'other'], default: 'call' },
      },
    },
    defaults: { due_in_minutes: 15, type: 'call' },
  },
  {
    key: 'no_answer_retry',
    name: 'No answer retry',
    description: 'When a call is logged as not answered, create a follow-up call for tomorrow.',
    triggers: ['call.logged'],
    settings_schema: {
      type: 'object',
      properties: {
        at: { type: 'string', title: 'Time tomorrow', format: 'time', default: '11:00' },
      },
    },
    defaults: { at: '11:00' },
  },
  {
    key: 'stage_follow_up',
    name: 'Stage follow-up',
    description: 'When a deal moves to one of the chosen stages, create a task for its owner after X days.',
    triggers: ['deal.stage_changed'],
    settings_schema: {
      type: 'object',
      properties: {
        stage_ids: { type: 'array', title: 'Stages', items: { type: 'string' }, 'x-widget': 'stage_select' },
        days: { type: 'integer', title: 'After (days)', minimum: 0, maximum: 365, default: 2 },
        type: { type: 'string', title: 'Follow-up type', enum: ['call', 'whatsapp', 'meeting', 'site_visit', 'other'], default: 'call' },
        title: { type: 'string', title: 'Follow-up title' },
      },
    },
    defaults: { stage_ids: [], days: 2, type: 'call' },
  },
  {
    key: 'stale_deal_alert',
    name: 'Stale deal alert',
    description: 'When an open deal sits in the same stage for X days, notify its owner and the managers.',
    triggers: ['schedule'],
    settings_schema: {
      type: 'object',
      properties: { days: { type: 'integer', title: 'Days in stage', minimum: 1, maximum: 365, default: 7 } },
    },
    defaults: { days: 7 },
  },
  {
    key: 'won_notice',
    name: 'Won notice',
    description: 'When a deal is won, tell the whole team. Optionally send the customer a thank-you on WhatsApp.',
    triggers: ['deal.won'],
    settings_schema: {
      type: 'object',
      properties: {
        send_thank_you: { type: 'boolean', title: 'Send a thank-you on WhatsApp', default: false },
        template_name: { type: 'string', title: 'WhatsApp template name', 'x-widget': 'whatsapp_template' },
        notify_user_id: { type: 'string', title: 'Also notify', 'x-widget': 'user_select' },
      },
    },
    defaults: { send_thank_you: false },
  },
];

export const NOTIFICATION_TYPES: { type: string; label: string; whatsapp: boolean }[] = [
  { type: 'lead.assigned', label: 'A lead is assigned to me', whatsapp: true },
  { type: 'lead.reenquired', label: 'A lead enquires again', whatsapp: true },
  { type: 'lead.untouched', label: 'A lead is still untouched after 30 minutes', whatsapp: true },
  { type: 'lead.unassigned', label: 'A lead arrives with no owner', whatsapp: false },
  { type: 'task.assigned', label: 'A follow-up is assigned to me', whatsapp: false },
  { type: 'task.reminder', label: 'A follow-up is due in 15 minutes', whatsapp: false },
  { type: 'task.overdue', label: 'A follow-up is overdue', whatsapp: true },
  { type: 'digest.overdue', label: 'Daily overdue summary', whatsapp: false },
  { type: 'deal.stale', label: 'A deal has stalled', whatsapp: false },
  { type: 'deal.won', label: 'A deal is won', whatsapp: false },
  { type: 'billing.read_only', label: 'Workspace became read-only', whatsapp: true },
];
