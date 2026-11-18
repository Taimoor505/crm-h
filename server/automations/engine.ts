import type { Tx } from '../db';
import { jsonb } from '../db';
import type { Job } from '../queue';
import { AUTOMATIONS, effectiveSettings, type AutomationDef, type RunContext, type RunResult } from './catalog';

interface Enabled { key: string; settings: unknown }

async function enabledFor(tx: Tx, workspaceId: string, keys: string[]): Promise<Enabled[]> {
  if (keys.length === 0) return [];
  return tx<Enabled[]>`
    select a.key, a.settings from public.automations a
      join public.workspaces w on w.id = a.workspace_id
     where a.workspace_id = ${workspaceId} and a.enabled and w.status = 'active'
       and a.key = any(${keys}::text[])`;
}

/**
 * Runs one rule once for a trigger and logs it. Each rule runs in its own
 * savepoint: a failing rule is logged as failed without undoing the others.
 * (automation_key, trigger_ref) is unique, so a retried trigger is a no-op.
 */
export async function runRule(
  tx: Tx,
  def: AutomationDef,
  ctx: RunContext,
  triggerRef: string,
): Promise<'success' | 'skipped' | 'failed' | 'already_ran'> {
  const [done] = await tx`
    select 1 from public.automation_runs where automation_key = ${def.key} and trigger_ref = ${triggerRef}`;
  if (done) return 'already_ran';

  let outcome: RunResult | null = null;
  let error: string | null = null;
  try {
    outcome = await tx.savepoint((sp) => def.run(sp, ctx));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const status = outcome?.status ?? 'failed';
  await tx`
    insert into public.automation_runs
      (workspace_id, automation_key, trigger_event, trigger_ref, contact_id, deal_id, status, result, error)
    values (${ctx.workspaceId}, ${def.key}, ${ctx.event}, ${triggerRef}, ${ctx.contactId}, ${ctx.dealId},
            ${status}, ${jsonb(tx, outcome?.result ?? {})}::jsonb, ${error})
    on conflict (automation_key, trigger_ref) do nothing`;
  return status;
}

/** Worker handler for lead.received, call.logged, deal.stage_changed, deal.won. */
export async function runAutomationsForEvent(tx: Tx, job: Job): Promise<Record<string, string>> {
  const workspaceId = job.workspace_id ?? (job.payload.workspace_id as string | undefined);
  if (!workspaceId) return {};
  const defs = AUTOMATIONS.filter((a) => a.triggers.includes(job.name));
  const enabled = await enabledFor(tx, workspaceId, defs.map((d) => d.key));
  if (enabled.length === 0) return {};

  const [w] = await tx<{ timezone: string }[]>`select timezone from public.workspaces where id = ${workspaceId}`;
  let contactId = typeof job.payload.contact_id === 'string' ? job.payload.contact_id : null;
  const dealId = typeof job.payload.deal_id === 'string' ? job.payload.deal_id : null;
  if (!contactId && dealId) {
    const [d] = await tx<{ contact_id: string | null }[]>`select contact_id from public.deals where id = ${dealId}`;
    contactId = d?.contact_id ?? null;
  }

  const out: Record<string, string> = {};
  for (const row of enabled) {
    const def = defs.find((d) => d.key === row.key)!;
    out[def.key] = await runRule(tx, def, {
      workspaceId,
      timezone: w.timezone,
      event: job.name,
      payload: job.payload,
      settings: effectiveSettings(def, row.settings),
      contactId,
      dealId,
    }, `job:${job.id}`);
  }
  return out;
}

/**
 * Scheduler job: stale deal alerts. One alert per deal per stage visit
 * (trigger_ref = deal + stage_entered_at), so a deal that keeps sitting there
 * is reported once, and again only after it moves and stalls again.
 */
export async function runStaleDealAlerts(tx: Tx): Promise<{ alerted: number }> {
  const def = AUTOMATIONS.find((a) => a.key === 'stale_deal_alert')!;
  const rows = await tx<{ workspace_id: string; settings: unknown; timezone: string }[]>`
    select a.workspace_id, a.settings, w.timezone
      from public.automations a join public.workspaces w on w.id = a.workspace_id
     where a.key = 'stale_deal_alert' and a.enabled and w.status = 'active'`;
  let alerted = 0;
  for (const r of rows) {
    const settings = effectiveSettings(def, r.settings) as { days: number };
    const deals = await tx<{ id: string; contact_id: string | null; entered: string }[]>`
      select d.id, d.contact_id, extract(epoch from d.stage_entered_at)::bigint::text as entered
        from public.deals d join public.stages s on s.id = d.stage_id
       where d.workspace_id = ${r.workspace_id} and d.deleted_at is null and s.kind = 'open'
         and d.stage_entered_at < now() - make_interval(days => ${settings.days})
         and not exists (select 1 from public.automation_runs ar
                          where ar.automation_key = 'stale_deal_alert'
                            and ar.trigger_ref = 'deal:' || d.id || ':' || extract(epoch from d.stage_entered_at)::bigint)
       limit 500`;
    for (const d of deals) {
      const status = await runRule(tx, def, {
        workspaceId: r.workspace_id,
        timezone: r.timezone,
        event: 'schedule',
        payload: {},
        settings,
        contactId: d.contact_id,
        dealId: d.id,
      }, `deal:${d.id}:${d.entered}`);
      if (status === 'success') alerted++;
    }
  }
  return { alerted };
}
