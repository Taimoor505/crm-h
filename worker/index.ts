/**
 * Background worker: `npm run worker`. Run one or more instances alongside the
 * Next.js app (any always-on host: Railway, Fly, a VPS, a Cloud Run job...).
 * Several instances are safe: jobs are claimed with SKIP LOCKED and scheduler
 * windows are claimed by primary key.
 */
import { hostname } from 'node:os';
import { closeDb } from '../server/db';
import { processJobs } from './jobs';
import { runSchedulerTick } from './scheduler';

const workerId = `${hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1000);
const TICK_MS = 20_000;

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[worker] ${workerId} started`);
  let lastTick = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastTick >= TICK_MS) {
        lastTick = Date.now();
        const ran = (await runSchedulerTick(workerId)).filter((r) => r.status !== 'skipped');
        for (const r of ran) console.log(`[scheduler] ${r.key} ${r.status}`, JSON.stringify(r.result ?? {}));
      }
      const { processed } = await processJobs(workerId);
      if (processed === 0) await sleep(POLL_MS);
    } catch (err) {
      console.error('[worker] loop error', err);
      await sleep(5000);
    }
  }
  await closeDb();
  console.log(`[worker] ${workerId} stopped`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
