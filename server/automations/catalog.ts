import { z } from 'zod';
import type { Tx } from '../db';
import { logActivity } from '../core/contacts';
import { whatsapp } from '../core/whatsapp';
import { recordWhatsAppUsage } from '../usage';
import { createTask, TASK_TYPES } from '../tasks/service';
import { notify, notifyManagers } from '../notifications/service';
import { contactLabel } from '../assignment/engine';

/** What a rule's action reports back; stored in automation_runs.result. */
export type RunResult =
  | { status: 'success'; result: Record<string, unknown> }
  | { status: 'skipped'; result: { reason: string } };

export interface RunContext {
  workspaceId: string;
  timezone: string;
  event: string;
  payload: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** Filled in by the engine for contact/deal events. */
  contactId: string | null;
  dealId: string | null;
}

export interface AutomationDef<S extends z.ZodType = z.ZodType> {
  key: string;
  name: string;
  description: string;
  /** Queue events that fire it; 'schedule' rules run from the scheduler. */
  triggers: string[];
  settings: S;
  run: (tx: Tx, ctx: RunContext & { settings: z.infer<S> }) => Promise<RunResult>;
}

/** Keeps each rule's settings type while storing them in one list. */
function define<S extends z.ZodType>(d: AutomationDef<S>): AutomationDef {
  return d as unknown as AutomationDef;
}

const skipped = (reason: string): RunResult => ({ status: 'skipped', result: { reason } });

interface ContactRow { id: string; name: string | null; phone_e164: string | null; email: string | null; owner_id: string | null }
interface DealRow { id: string; title: string; value_minor: string | null; currency: string; owner_id: string | null; contact_id: string | null; stage_id: string }

async function loadContact(tx: Tx, id: string | null): Promise<ContactRow | null> {
  if (!id) return null;
  const [c] = await tx<ContactRow[]>`
    select id, name, phone_e164, email, owner_id from public.contacts where id = ${id} and deleted_at is null`;
  return c ?? null;
}

async function loadDeal(tx: Tx, id: string | null): Promise<DealRow | null> {
  if (!id) return null;
  const [d] = await tx<DealRow[]>`
    select id, title, value_minor, currency, owner_id, contact_id, stage_id from public.deals where id = ${id} and deleted_at is null`;
  return d ?? null;
}

/** Sends a template to a lead through the workspace's WhatsApp, logs and counts it. */
async function sendLeadTemplate(
  tx: Tx,
  ctx: RunContext,
  contact: ContactRow,
  template: string,
  language: string,
  automationKey: string,
): Promise<RunResult> {
  if (!contact.phone_e164) return skipped('contact has no phone number');
  const firstName = (contact.name ?? '').trim().split(/\s+/)[0] ?? '';
  const { messageId } = await whatsapp().sendTemplate({
    workspaceId: ctx.workspaceId,
    to: contact.phone_e164,
    template,
    language,
    params: firstName ? [firstName] : [],
  });
  await recordWhatsAppUsage(tx, ctx.workspaceId, 1);
  await logActivity(tx, {
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    type: 'whatsapp',
    body: `WhatsApp template "${template}" sent automatically`,
    meta: { automation: automationKey, template, message_id: messageId, direction: 'outbound', counts_as_response: false },
  });
  return { status: 'success', result: { message_id: messageId, template } };
}

/** Due at `localTime` (HH:MM) on the day `daysAhead` from today, workspace time. */
async function localDueAt(tx: Tx, timezone: string, daysAhead: number, localTime: string): Promise<Date> {
  const [r] = await tx<{ at: Date }[]>`
    select ((date_trunc('day', now() at time zone ${timezone}) + make_interval(days => ${daysAhead})
             + ${localTime}::time) at time zone ${timezone}) as at`;
  return r.at;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const template = z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'WhatsApp template name (lowercase, digits, _)');

const welcome = define({
  key: 'welcome_message',
  name: 'Welcome message',
  description: 'When a new lead arrives, send them a WhatsApp template.',
  triggers: ['lead.received'],
  settings: z.object({ template_name: template.optional(), language: z.enum(['en', 'ur']).default('en') }),
  async run(tx, ctx) {
    if (ctx.payload.status !== 'created') return skipped('re-enquiry: already welcomed');
    if (!ctx.settings.template_name) return skipped('no template configured');
    const contact = await loadContact(tx, ctx.contactId);
    if (!contact) return skipped('contact not found');
    return sendLeadTemplate(tx, ctx, contact, ctx.settings.template_name, ctx.settings.language, 'welcome_message');
  },
});

const autoFollowUp = define({
  key: 'auto_follow_up',
  name: 'Auto follow-up',
  description: 'When a lead arrives (or enquires again), create a call task for its owner due in X minutes.',
  triggers: ['lead.received'],
  settings: z.object({
    due_in_minutes: z.number().int().min(0).max(7 * 24 * 60).default(15),
    type: z.enum(TASK_TYPES).default('call'),
  }),
  async run(tx, ctx) {
    const contact = await loadContact(tx, ctx.contactId);
    if (!contact) return skipped('contact not found');
    if (!contact.owner_id) return skipped('lead has no owner');
    const [open] = await tx`
      select 1 from public.tasks
       where contact_id = ${contact.id} and assigned_to = ${contact.owner_id} and status = 'open'`;
    if (open) return skipped('owner already has an open follow-up for this lead');
    const task = await createTask(tx, {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      assignedTo: contact.owner_id,
      createdBy: null,
      type: ctx.settings.type,
      dueAt: new Date(Date.now() + ctx.settings.due_in_minutes * 60_000),
      origin: 'automation',
      // The agent was just alerted about the lead itself; the 15-minute reminder covers the task.
      notifyAssignee: false,
    });
    return { status: 'success', result: { task_id: task.id } };
  },
});

const noAnswerRetry = define({
  key: 'no_answer_retry',
  name: 'No answer retry',
  description: 'When a call is logged as not answered, create a follow-up call for tomorrow.',
  triggers: ['call.logged'],
  settings: z.object({
    outcomes: z.array(z.string().trim().min(1).max(50)).min(1).max(10).default(['no_answer']),
    local_time: hhmm.default('11:00'),
  }),
  async run(tx, ctx) {
    const outcome = String(ctx.payload.outcome ?? '');
    if (!ctx.settings.outcomes.includes(outcome)) return skipped(`outcome "${outcome}" is not a retry outcome`);
    const contact = await loadContact(tx, ctx.contactId);
    if (!contact) return skipped('contact not found');
    const assignee = (typeof ctx.payload.actor_id === 'string' && ctx.payload.actor_id) || contact.owner_id;
    if (!assignee) return skipped('nobody to assign the retry to');
    const task = await createTask(tx, {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      assignedTo: assignee,
      createdBy: null,
      type: 'call',
      title: `Call again: ${contactLabel(contact)}`,
      dueAt: await localDueAt(tx, ctx.timezone, 1, ctx.settings.local_time),
      origin: 'automation',
    });
    return { status: 'success', result: { task_id: task.id } };
  },
});

const stageFollowUp = define({
  key: 'stage_follow_up',
  name: 'Stage follow-up',
  description: 'When a deal moves to one of the chosen stages, create a task for its owner after X days.',
  triggers: ['deal.stage_changed'],
  settings: z.object({
    stage_ids: z.array(z.uuid()).max(50).default([]),
    days: z.number().int().min(0).max(365).default(2),
    type: z.enum(TASK_TYPES).default('call'),
    title: z.string().trim().min(1).max(200).optional(),
    local_time: hhmm.default('11:00'),
  }),
  async run(tx, ctx) {
    const to = String(ctx.payload.to_stage_id ?? '');
    if (!ctx.settings.stage_ids.includes(to)) return skipped('not one of the chosen stages');
    const deal = await loadDeal(tx, ctx.dealId);
    if (!deal) return skipped('deal not found');
    if (!deal.owner_id) return skipped('deal has no owner');
    const task = await createTask(tx, {
      workspaceId: ctx.workspaceId,
      contactId: deal.contact_id,
      dealId: deal.id,
      assignedTo: deal.owner_id,
      createdBy: null,
      type: ctx.settings.type,
      title: ctx.settings.title ?? `Follow up: ${deal.title}`,
      dueAt: await localDueAt(tx, ctx.timezone, ctx.settings.days, ctx.settings.local_time),
      origin: 'automation',
    });
    return { status: 'success', result: { task_id: task.id } };
  },
});

const staleDeal = define({
  key: 'stale_deal_alert',
  name: 'Stale deal alert',
  description: 'When an open deal sits in the same stage for X days, notify its owner and the managers.',
  triggers: ['schedule'],
  settings: z.object({ days: z.number().int().min(1).max(365).default(7) }),
  async run(tx, ctx) {
    const deal = await loadDeal(tx, ctx.dealId);
    if (!deal) return skipped('deal not found');
    const days = ctx.settings.days;
    const n = {
      workspaceId: ctx.workspaceId,
      type: 'deal.stale',
      title: `No movement for ${days}+ days: ${deal.title}`,
      data: { deal_id: deal.id, contact_id: deal.contact_id },
    };
    if (deal.owner_id) await notify(tx, { ...n, userId: deal.owner_id });
    await notifyManagers(tx, n, deal.owner_id);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      contactId: deal.contact_id,
      dealId: deal.id,
      type: 'system',
      body: `Stale deal alert: no stage change for ${days} days`,
      meta: { automation: 'stale_deal_alert', counts_as_response: false },
    });
    return { status: 'success', result: { notified_owner: !!deal.owner_id } };
  },
});

const wonNotice = define({
  key: 'won_notice',
  name: 'Won notice',
  description: 'When a deal is won, tell the whole team. Optionally send the customer a thank-you on WhatsApp.',
  triggers: ['deal.won'],
  settings: z.object({
    send_thank_you: z.boolean().default(false),
    template_name: template.optional(),
    language: z.enum(['en', 'ur']).default('en'),
  }),
  async run(tx, ctx) {
    const deal = await loadDeal(tx, ctx.dealId);
    if (!deal) return skipped('deal not found');
    const [owner] = await tx<{ name: string | null }[]>`select name from public.users where id = ${deal.owner_id}`;
    const value = deal.value_minor && Number(deal.value_minor) > 0
      ? ` (${new Intl.NumberFormat('en', { style: 'currency', currency: deal.currency, maximumFractionDigits: 0 }).format(Number(deal.value_minor) / 100)})`
      : '';
    const members = await tx<{ user_id: string }[]>`
      select user_id from public.memberships where workspace_id = ${ctx.workspaceId} and status = 'active'`;
    for (const m of members) {
      await notify(tx, {
        workspaceId: ctx.workspaceId,
        userId: m.user_id,
        type: 'deal.won',
        title: `Deal won${owner?.name ? ` by ${owner.name}` : ''}: ${deal.title}${value}`,
        data: { deal_id: deal.id, contact_id: deal.contact_id },
        dedupeKey: `deal.won:${deal.id}`,
      });
    }
    const result: Record<string, unknown> = { notified: members.length };
    if (ctx.settings.send_thank_you) {
      if (!ctx.settings.template_name) {
        result.thank_you = 'skipped: no template configured';
      } else {
        const contact = await loadContact(tx, deal.contact_id);
        const sent = contact
          ? await sendLeadTemplate(tx, ctx, contact, ctx.settings.template_name, ctx.settings.language, 'won_notice')
          : skipped('deal has no contact');
        result.thank_you = sent.result;
      }
    }
    return { status: 'success', result };
  },
});

export const AUTOMATIONS: AutomationDef[] = [welcome, autoFollowUp, noAnswerRetry, stageFollowUp, staleDeal, wonNotice];
export const AUTOMATION_KEYS = AUTOMATIONS.map((a) => a.key) as [string, ...string[]];
export const automationByKey = (key: string) => AUTOMATIONS.find((a) => a.key === key);

/** Settings with defaults applied (invalid stored settings fall back to defaults). */
export function effectiveSettings(def: AutomationDef, stored: unknown): Record<string, unknown> {
  const parsed = def.settings.safeParse(stored ?? {});
  return (parsed.success ? parsed.data : def.settings.parse({})) as Record<string, unknown>;
}
