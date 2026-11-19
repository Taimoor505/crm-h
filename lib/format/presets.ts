import { zonedParts, zonedTimeToUtc } from './index';

export type DuePreset = 'in_1h' | 'tomorrow' | 'next_week';

/** Follow-up due times in the workspace zone: tomorrow and next week land at 10:00 local. */
export function presetDueAt(preset: DuePreset, timeZone: string, now = new Date()): string {
  if (preset === 'in_1h') return new Date(now.getTime() + 3600_000).toISOString();
  const p = zonedParts(now, timeZone);
  const days = preset === 'tomorrow' ? 1 : 7;
  return zonedTimeToUtc(p.year, p.month, p.day + days, 10, 0, timeZone).toISOString();
}

/** A local date ("2026-11-20") and time ("14:30") in the workspace zone → ISO UTC. */
export function localToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '10:00').split(':').map(Number);
  return zonedTimeToUtc(y, m, d, hh, mm, timeZone).toISOString();
}

/** ISO → { date, time } in the workspace zone, for date/time inputs. */
export function isoToLocal(iso: string, timeZone: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}
