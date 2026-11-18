import { jsonb, withService, type Tx } from '../server/db';
import { reassignUntouchedLeads } from '../server/assignment/reassign';
import {
  sendOverdueAlerts, sendOverdueDigests, sendTaskReminders, sendUntouchedLeadAlerts,
} from '../server/followups/alerts';

export interface ScheduledJob {
  key: string;
  everyMinutes: number;
  run: (tx: Tx) => Promise<Record<string, unknown>>;
}

/**
 * Scheduled jobs. Each runs at most once per window (see scheduler_runs), and
 * each is written so that running it twice changes nothing the second time.
 */
export const SCHEDULE: ScheduledJob[] = [
  {
    key: 'leads.auto_reassign',
    everyMinutes: 1,
    run: (tx) => reassignUntouchedLeads(tx),
  },
  { key: 'tasks.reminders', everyMinutes: 1, run: (tx) => sendTaskReminders(tx) },
  { key: 'tasks.overdue_alerts', everyMinutes: 5, run: (tx) => sendOverdueAlerts(tx) },
  { key: 'leads.untouched_alerts', everyMinutes: 1, run: (tx) => sendUntouchedLeadAlerts(tx) },
  { key: 'digest.overdue', everyMinutes: 15, run: (tx) => sendOverdueDigests(tx) },
  {
    key: 'jobs.recover_stale',
    everyMinutes: 5,
    // A worker that died mid-job leaves it 'running'; hand it back to the queue.
    run: async (tx) => {
      const r = await tx`
        update public.jobs set status = 'queued', locked_at = null, locked_by = null,
               last_error = coalesce(last_error, '') || 'recovered after worker timeout'
         where status = 'running' and locked_at < now() - interval '10 minutes'`;
      return { recovered: r.count };
    },
  },
  {
    key: 'housekeeping',
    everyMinutes: 60,
    run: async (tx) => {
      const events = await tx`delete from public.lead_events where received_at < now() - interval '30 days'`;
      const jobs = await tx`delete from public.jobs
                             where status = 'done' and finished_at < now() - interval '14 days'`;
      const runs = await tx`delete from public.scheduler_runs where started_at < now() - interval '30 days'`;
      const limits = await tx`delete from public.rate_limits where window_start < now() - interval '1 hour'`;
      return { lead_events: events.count, jobs: jobs.count, scheduler_runs: runs.count, rate_limits: limits.count };
    },
  },
];

export function windowStart(now: Date, everyMinutes: number): Date {
  const ms = everyMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Runs every job whose current window hasn't run yet. Safe to call from many
 * workers at once: the (job_key, window_start) primary key picks one winner.
 */
export async function runSchedulerTick(
  workerId: string,
  now = new Date(),
  jobs: ScheduledJob[] = SCHEDULE,
): Promise<{ key: string; status: 'done' | 'failed' | 'skipped'; result?: unknown }[]> {
  const out: { key: string; status: 'done' | 'failed' | 'skipped'; result?: unknown }[] = [];
  for (const job of jobs) {
    const window = windowStart(now, job.everyMinutes).toISOString();
    const claimed = await withService(async (tx) => {
      const r = await tx`
        insert into public.scheduler_runs (job_key, window_start, worker)
        values (${job.key}, ${window}::timestamptz, ${workerId})
        on conflict do nothing`;
      return r.count === 1;
    });
    if (!claimed) {
      out.push({ key: job.key, status: 'skipped' });
      continue;
    }
    try {
      const result = await withService((tx) => job.run(tx));
      await withService((tx) => tx`
        update public.scheduler_runs set status = 'done', finished_at = now(), result = ${jsonb(tx, result)}::jsonb
         where job_key = ${job.key} and window_start = ${window}::timestamptz`);
      out.push({ key: job.key, status: 'done', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] ${job.key} failed`, err);
      await withService((tx) => tx`
        update public.scheduler_runs set status = 'failed', finished_at = now(), error = ${message}
         where job_key = ${job.key} and window_start = ${window}::timestamptz`);
      out.push({ key: job.key, status: 'failed', result: message });
    }
  }
  return out;
}
