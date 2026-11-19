/**
 * All user-visible money, numbers, dates, relative times and areas go through
 * here, using the workspace region settings. Built only on Intl.
 */
import type { RegionSettings } from './settings';

export type { RegionSettings } from './settings';
export { regionFromCountry, COUNTRY_DEFAULTS, COMMON_CURRENCIES, supportedTimezones, deviceTimezone } from './settings';

type Fmt = Pick<RegionSettings, 'locale'> & Partial<RegionSettings>;

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = nfCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, opts);
    } catch {
      f = new Intl.NumberFormat('en-US', opts);
    }
    nfCache.set(key, f);
  }
  return f;
}

// ---------------------------------------------------------------- money

export interface Money {
  /** Amount in minor units (cents, fils, paisa). */
  amount_minor: number;
  currency: string;
}

export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

/** `amount` is in major units (e.g. dollars). */
export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  settings: Fmt,
  opts: { compact?: boolean } = {},
): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  const base: Intl.NumberFormatOptions = { style: 'currency', currency };
  if (opts.compact) {
    return nf(settings.locale, { ...base, notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  }
  // Whole amounts don't need ".00" in a CRM.
  const whole = Number.isInteger(amount);
  return nf(settings.locale, whole ? { ...base, maximumFractionDigits: 0 } : base).format(amount);
}

export function formatMoneyValue(money: Money | null | undefined, settings: Fmt, opts: { compact?: boolean } = {}): string {
  if (!money) return '—';
  return formatMoney(fromMinor(money.amount_minor, money.currency), money.currency, settings, opts);
}

/** Symbol or code for a currency in the given locale, for input adornments. */
export function currencySymbol(currency: string, locale: string): string {
  const part = nf(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

// ---------------------------------------------------------------- numbers

export function formatNumber(n: number | null | undefined, settings: Fmt, opts: Intl.NumberFormatOptions = {}): string {
  if (n == null || Number.isNaN(n)) return '—';
  return nf(settings.locale, opts).format(n);
}

export function formatCompact(n: number, settings: Fmt): string {
  return nf(settings.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** `ratio` is 0..1. */
export function formatPercent(ratio: number | null | undefined, settings: Fmt, digits = 0): string {
  if (ratio == null || Number.isNaN(ratio)) return '—';
  return nf(settings.locale, { style: 'percent', maximumFractionDigits: digits }).format(ratio);
}

/** Durations such as speed-to-lead: "45 sec", "12 min", "3 hr", "2 days". */
export function formatDuration(seconds: number | null | undefined, settings: Fmt): string {
  if (seconds == null) return '—';
  const s = Math.abs(seconds);
  const unit = (value: number, u: 'second' | 'minute' | 'hour' | 'day') =>
    nf(settings.locale, { style: 'unit', unit: u, unitDisplay: 'short', maximumFractionDigits: value < 10 && u !== 'second' ? 1 : 0 }).format(value);
  if (s < 60) return unit(s, 'second');
  if (s < 3600) return unit(s / 60, 'minute');
  if (s < 86400) return unit(s / 3600, 'hour');
  return unit(s / 86400, 'day');
}

// ---------------------------------------------------------------- area

export type AreaUnit = 'sqft' | 'sqm';
const SQFT_PER_SQM = 10.7639;
const AREA_SUFFIX: Record<AreaUnit, string> = { sqft: 'sq ft', sqm: 'm²' };

export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  if (from === to) return value;
  return from === 'sqm' ? value * SQFT_PER_SQM : value / SQFT_PER_SQM;
}

/** `value` is stored in `storedUnit` (default: the workspace unit). */
export function formatArea(value: number | null | undefined, settings: Fmt, storedUnit?: AreaUnit): string {
  if (value == null || Number.isNaN(value)) return '—';
  const unit = settings.area_unit ?? 'sqm';
  const v = convertArea(value, storedUnit ?? unit, unit);
  return `${nf(settings.locale, { maximumFractionDigits: v < 100 ? 1 : 0 }).format(v)} ${AREA_SUFFIX[unit]}`;
}

export function areaUnitLabel(unit: AreaUnit): string {
  return AREA_SUFFIX[unit];
}

// ---------------------------------------------------------------- time zones

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        weekday: 'short', hourCycle: 'h23',
      });
    } catch {
      f = partsFormatter('UTC');
    }
    dtfCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) out[p.type] = p.value;
  return {
    year: +out.year,
    month: +out.month,
    day: +out.day,
    hour: +out.hour % 24,
    minute: +out.minute,
    second: +out.second,
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** The UTC instant of a wall-clock time in a time zone. */
export function zonedTimeToUtc(
  y: number, m: number, d: number, hh: number, mm: number, timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffsetMs(new Date(guess), timeZone);
  // A second pass settles DST transitions.
  ts = guess - tzOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

export function startOfDayInTz(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

export function addDaysInTz(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day + days, p.hour, p.minute, timeZone);
}

/** "yyyy-mm-dd" of the instant in the time zone (report ranges, grouping). */
export function dayKey(date: Date | string, timeZone: string): string {
  const p = zonedParts(typeof date === 'string' ? new Date(date) : date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isToday(iso: string | Date, timeZone: string, now = new Date()): boolean {
  return dayKey(iso, timeZone) === dayKey(now, timeZone);
}

export function isOverdue(iso: string | Date, now = new Date()): boolean {
  return new Date(iso).getTime() < now.getTime();
}

// ---------------------------------------------------------------- dates

const MONTHS_CACHE = new Map<string, { short: string[]; long: string[]; weekdays: string[] }>();
function names(locale: string) {
  let n = MONTHS_CACHE.get(locale);
  if (!n) {
    const short: string[] = [];
    const long: string[] = [];
    const weekdays: string[] = [];
    const s = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const l = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    const w = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(2024, i, 1));
      short.push(s.format(d));
      long.push(l.format(d));
    }
    for (let i = 0; i < 7; i++) weekdays.push(w.format(new Date(Date.UTC(2024, 0, 7 + i))));
    n = { short, long, weekdays };
    MONTHS_CACHE.set(locale, n);
  }
  return n;
}

/** Applies a date pattern (dd, d, MM, M, MMM, MMMM, yy, yyyy, EEE). */
function applyPattern(pattern: string, p: ZonedParts, locale: string): string {
  const n = names(locale);
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|EEE/g, (tok) => {
    switch (tok) {
      case 'yyyy': return String(p.year);
      case 'yy': return String(p.year).slice(-2);
      case 'MMMM': return n.long[p.month - 1];
      case 'MMM': return n.short[p.month - 1];
      case 'MM': return String(p.month).padStart(2, '0');
      case 'M': return String(p.month);
      case 'dd': return String(p.day).padStart(2, '0');
      case 'd': return String(p.day);
      case 'EEE': return n.weekdays[p.weekday];
      default: return tok;
    }
  });
}

type DateInput = string | Date | null | undefined;
function toDate(v: DateInput): Date | null {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: DateInput, settings: Fmt & { timezone?: string; date_format?: string }): string {
  const d = toDate(value);
  if (!d) return '—';
  // Date-only strings ("2026-12-10") are calendar dates, not instants.
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const p = zonedParts(d, dateOnly ? 'UTC' : settings.timezone ?? 'UTC');
  return applyPattern(settings.date_format ?? 'dd MMM yyyy', p, settings.locale);
}

/** Short date for lists: "12 Nov" (or "Nov 12"), with the year only when it differs. */
export function formatShortDate(value: DateInput, settings: Fmt & { timezone?: string }, now = new Date()): string {
  const d = toDate(value);
  if (!d) return '—';
  const tz = settings.timezone ?? 'UTC';
  const sameYear = zonedParts(d, tz).year === zonedParts(now, tz).year;
  return new Intl.DateTimeFormat(settings.locale, {
    timeZone: tz, day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

export function formatTime(value: DateInput, settings: Fmt & { timezone?: string; time_format?: '12h' | '24h' }): string {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone ?? 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: settings.time_format === '24h' ? 'h23' : 'h12',
  }).format(d);
}

export function formatDateTime(value: DateInput, settings: Fmt & Partial<RegionSettings>): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d, settings)}, ${formatTime(d, settings)}`;
}

export function formatWeekday(value: DateInput, settings: Fmt & { timezone?: string }): string {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone ?? 'UTC', weekday: 'long' }).format(d);
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
function rtf(locale: string, style: 'long' | 'short' | 'narrow') {
  const key = `${locale}:${style}`;
  let f = rtfCache.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
    rtfCache.set(key, f);
  }
  return f;
}

/** "5 min ago", "in 2 hr", "yesterday". */
export function formatRelative(
  value: DateInput,
  settings: Fmt & { timezone?: string },
  now = new Date(),
  style: 'long' | 'short' | 'narrow' = 'short',
): string {
  const d = toDate(value);
  if (!d) return '—';
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const f = rtf(settings.locale, style);
  if (abs < 45) return f.format(0, 'second');
  if (abs < 3600) return f.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return f.format(Math.round(diffSec / 3600), 'hour');
  const tz = settings.timezone ?? 'UTC';
  const days = Math.round((startOfDayInTz(d, tz).getTime() - startOfDayInTz(now, tz).getTime()) / 86400000);
  if (Math.abs(days) < 7) return f.format(days, 'day');
  if (Math.abs(days) < 30) return f.format(Math.round(days / 7), 'week');
  if (Math.abs(days) < 365) return f.format(Math.round(days / 30), 'month');
  return f.format(Math.round(days / 365), 'year');
}

/** Minutes since an instant (for the "new lead turns red after 30 min" rule). */
export function minutesSince(value: DateInput, now = new Date()): number {
  const d = toDate(value);
  return d ? Math.floor((now.getTime() - d.getTime()) / 60000) : 0;
}

/** Whole days between an instant and now, in the workspace time zone. */
export function daysSince(value: DateInput, timeZone: string, now = new Date()): number {
  const d = toDate(value);
  if (!d) return 0;
  return Math.max(0, Math.round((startOfDayInTz(now, timeZone).getTime() - startOfDayInTz(d, timeZone).getTime()) / 86400000));
}
