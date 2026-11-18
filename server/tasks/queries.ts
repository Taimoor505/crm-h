import type { Db } from '../db';

/** Start and end of "today" in the workspace's timezone, as SQL fragments. */
export function todayBounds(tx: Db, timezone: string) {
  const start = tx`(date_trunc('day', now() at time zone ${timezone}) at time zone ${timezone})`;
  const end = tx`((date_trunc('day', now() at time zone ${timezone}) + interval '1 day') at time zone ${timezone})`;
  return { start, end };
}

export type DueBucket = 'overdue' | 'today' | 'upcoming';

/**
 * Non-overlapping buckets for open tasks, as the home screen shows them:
 *   overdue  = due before now
 *   today    = due from now until midnight (workspace time)
 *   upcoming = due after today
 */
export function dueCondition(tx: Db, bucket: DueBucket, timezone: string) {
  const { end } = todayBounds(tx, timezone);
  switch (bucket) {
    case 'overdue':
      return tx`t.due_at < now()`;
    case 'today':
      return tx`t.due_at >= now() and t.due_at < ${end}`;
    case 'upcoming':
      return tx`t.due_at >= ${end}`;
  }
}

/** Columns returned for a task, with a small embedded contact for list views. */
export function taskSelect(tx: Db) {
  return tx`
    t.*,
    case when c.id is null then null
         else json_build_object('id', c.id, 'name', c.name, 'phone_e164', c.phone_e164) end as contact,
    t.status = 'open' and t.due_at < now() as is_overdue`;
}
