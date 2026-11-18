import { withService, type Tx } from '../server/db';
import { claimJobs, completeJob, failJob, type Job } from '../server/queue';
import { registerInboundContact } from '../server/leads/ingest';

type Handler = (tx: Tx, job: Job) => Promise<void>;

/**
 * Event and job handlers. Events nobody handles yet (deal.won etc. are for the
 * automations in weeks 9-10) are marked done so the queue stays clean.
 */
export const HANDLERS: Record<string, Handler> = {
  // Taimoor's WhatsApp webhook creates contacts for new inbound numbers; those
  // are leads too, so give them the same enquiry tracking and assignment.
  'contact.created': async (tx, job) => {
    await registerInboundContact(tx, String(job.payload.contact_id));
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
