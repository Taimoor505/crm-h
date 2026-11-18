import { withService, type Tx } from '../server/db';
import { claimJobs, completeJob, failJob, type Job } from '../server/queue';
import { registerInboundContact } from '../server/leads/ingest';
import { fetchMetaLead } from '../server/leads/meta';
import { runAutomationsForEvent } from '../server/automations/engine';
import { deliverNotification, dispatchNotification } from '../server/notifications/dispatch';

type Handler = (tx: Tx, job: Job) => Promise<void>;

const automations: Handler = async (tx, job) => {
  await runAutomationsForEvent(tx, job);
};

/**
 * Event and job handlers. Events with no handler (e.g. contact.updated) are
 * marked done so the queue stays clean.
 */
export const HANDLERS: Record<string, Handler> = {
  // Taimoor's WhatsApp webhook creates contacts for new inbound numbers; those
  // are leads too, so give them the same enquiry tracking and assignment.
  'contact.created': async (tx, job) => {
    await registerInboundContact(tx, String(job.payload.contact_id));
  },
  'lead.received': automations,
  'call.logged': automations,
  'deal.stage_changed': automations,
  'deal.won': automations,
  'meta.fetch_lead': async (tx, job) => {
    await fetchMetaLead(tx, String(job.payload.lead_event_id));
  },
  'notification.dispatch': async (tx, job) => {
    await dispatchNotification(tx, String(job.payload.notification_id));
  },
  'notification.deliver': async (tx, job) => {
    await deliverNotification(tx, String(job.payload.delivery_id));
  },
};

/** Claims and runs one batch. Each job runs in its own transaction. */
export async function processJobs(workerId: string, batchSize = 10): Promise<{ processed: number; failed: number }> {
  const jobs = await withService((tx) => claimJobs(tx, workerId, batchSize));
  let failed = 0;
  for (const job of jobs) {
    const handler = HANDLERS[job.name];
    try {
      await withService(async (tx) => {
        if (handler) await handler(tx, job);
        await completeJob(tx, job.id);
      });
    } catch (err) {
      failed++;
      console.error(`[worker] job ${job.id} ${job.name} failed`, err);
      await withService((tx) => failJob(tx, job, err));
    }
  }
  return { processed: jobs.length, failed };
}
