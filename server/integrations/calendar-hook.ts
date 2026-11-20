import { after } from 'next/server';
import { googleConfigured, syncTasks } from './google';

/** Origin of the request, so event links point back to the domain the user is on. */
export function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

/**
 * Pushes these follow-ups to Google Calendar after the response is sent
 * (the request's transaction has committed by then). No-op without Google config.
 */
export function syncCalendarLater(req: Request, taskIds: (string | null | undefined)[]) {
  if (!googleConfigured()) return;
  const ids = taskIds.filter((x): x is string => Boolean(x));
  if (!ids.length) return;
  schedule(ids, originOf(req));
}

type Scheduler = (taskIds: string[], origin: string) => void;

const afterResponse: Scheduler = (ids, origin) => {
  try {
    after(() => syncTasks(ids, origin));
  } catch {
    // Outside a request (scripts): run now, don't block the caller.
    void syncTasks(ids, origin).catch(() => undefined);
  }
};

let schedule: Scheduler = afterResponse;
/** Tests swap this to run the sync themselves. */
export function setCalendarScheduler(s: Scheduler | null) {
  schedule = s ?? afterResponse;
}
