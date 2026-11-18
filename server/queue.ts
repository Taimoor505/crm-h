import { jsonb, type Db } from './db';

export interface EnqueueOptions {
  workspaceId?: string | null;
  runAt?: Date | string;
  /** Same key twice enqueues once; use it to make producers idempotent. */
  dedupeKey?: string;
  queue?: string;
}

/** Enqueues a job/event inside the caller's transaction (commits with it). */
export async function enqueue(
  tx: Db,
  name: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<number | null> {
  const runAt = opts.runAt ? new Date(opts.runAt).toISOString() : null;
  const [row] = await tx<{ id: string | null }[]>`
    select public.enqueue_job(
      ${name}, ${jsonb(tx, payload)}::jsonb, ${opts.workspaceId ?? null}::uuid,
      coalesce(${runAt}::timestamptz, now()), ${opts.dedupeKey ?? null}, ${opts.queue ?? null}
    ) as id`;
  return row?.id ? Number(row.id) : null;
}

export interface Job {
  id: string;
  queue: string;
  name: string;
  payload: Record<string, unknown>;
  workspace_id: string | null;
  attempts: number;
  max_attempts: number;
}

/** Claims up to `limit` ready jobs for this worker (SKIP LOCKED: safe with many workers). */
export async function claimJobs(tx: Db, workerId: string, limit = 10): Promise<Job[]> {
  return tx<Job[]>`
    update public.jobs j
       set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = j.attempts + 1
     where j.id in (
       select id from public.jobs
        where status = 'queued' and run_at <= now()
        order by run_at, id
        limit ${limit}
        for update skip locked)
    returning j.id, j.queue, j.name, j.payload, j.workspace_id, j.attempts, j.max_attempts`;
}

export async function completeJob(tx: Db, id: string): Promise<void> {
  await tx`update public.jobs set status = 'done', finished_at = now(), locked_at = null
           where id = ${id}`;
}

/** Retries with exponential backoff (30s, 60s, 120s, ...) until max_attempts, then 'dead'. */
export async function failJob(tx: Db, job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  const dead = job.attempts >= job.max_attempts;
  await tx`
    update public.jobs
       set status = ${dead ? 'dead' : 'queued'},
           last_error = ${message.slice(0, 4000)},
           locked_at = null, locked_by = null,
           run_at = now() + make_interval(secs => ${30 * 2 ** (job.attempts - 1)}),
           finished_at = ${dead ? new Date().toISOString() : null}::timestamptz
     where id = ${job.id}`;
}
