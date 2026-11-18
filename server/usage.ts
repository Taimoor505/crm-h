import type { Db } from './db';

/** Meta's per-message charge we pass through, in PKR (set WHATSAPP_COST_PKR). */
export function whatsappUnitCostPkr(): number {
  const v = Number(process.env.WHATSAPP_COST_PKR ?? '0');
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Counts WhatsApp messages sent for a workspace in the current month (in the
 * workspace's timezone) for pass-through billing. Taimoor's sender should call
 * this too for every template message it sends.
 */
export async function recordWhatsAppUsage(tx: Db, workspaceId: string, count = 1): Promise<void> {
  const cost = Math.round(whatsappUnitCostPkr() * count * 100) / 100;
  await tx`
    insert into public.usage_counters (workspace_id, period, whatsapp_sent, whatsapp_cost_pkr)
    select ${workspaceId}, date_trunc('month', now() at time zone w.timezone)::date, ${count}, ${cost}
      from public.workspaces w where w.id = ${workspaceId}
    on conflict (workspace_id, period) do update set
      whatsapp_sent = public.usage_counters.whatsapp_sent + excluded.whatsapp_sent,
      whatsapp_cost_pkr = public.usage_counters.whatsapp_cost_pkr + excluded.whatsapp_cost_pkr,
      updated_at = now()`;
}
