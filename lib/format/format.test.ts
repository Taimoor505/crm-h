import { describe, expect, it } from 'vitest';
import {
  dayKey, formatArea, formatDate, formatMoney, formatMoneyValue, formatRelative, formatTime, isOverdue, isToday,
  regionFromCountry, startOfDayInTz, toMinor,
} from './index';

// The four test workspaces from brief §11.
const US = regionFromCountry('US');
const AE = regionFromCountry('AE');
const GB = regionFromCountry('GB');
const PK = regionFromCountry('PK');

const strip = (s: string) => s.replace(/[  ]/g, ' ');

describe('region defaults', () => {
  it('matches the brief table', () => {
    expect([US.locale, US.currency, US.timezone, US.area_unit]).toEqual(['en-US', 'USD', 'America/New_York', 'sqft']);
    expect([AE.locale, AE.currency, AE.timezone, AE.area_unit]).toEqual(['en-AE', 'AED', 'Asia/Dubai', 'sqft']);
    expect([GB.locale, GB.currency, GB.timezone, GB.area_unit]).toEqual(['en-GB', 'GBP', 'Europe/London', 'sqm']);
    expect([PK.locale, PK.currency, PK.timezone, PK.area_unit]).toEqual(['en-PK', 'PKR', 'Asia/Karachi', 'sqft']);
  });
});

describe('formatMoney', () => {
  it('formats with each workspace currency and locale', () => {
    expect(strip(formatMoney(1250000, 'USD', US))).toBe('$1,250,000');
    expect(strip(formatMoney(1250000, 'AED', AE))).toMatch(/AED\s?1,250,000/);
    expect(strip(formatMoney(1250000, 'GBP', GB))).toBe('£1,250,000');
    expect(strip(formatMoney(1250000, 'PKR', PK))).toMatch(/Rs\s?1,250,000|PKR\s?1,250,000/);
  });

  it('formats compact amounts', () => {
    expect(strip(formatMoney(1250000, 'USD', US, { compact: true }))).toBe('$1.3M');
    expect(strip(formatMoney(45000, 'GBP', GB, { compact: true }))).toBe('£45K');
  });

  it('keeps cents when present and handles minor units', () => {
    expect(strip(formatMoney(19.5, 'USD', US))).toBe('$19.50');
    expect(strip(formatMoneyValue({ amount_minor: toMinor(99.99, 'USD'), currency: 'USD' }, US))).toBe('$99.99');
    expect(formatMoney(null, 'USD', US)).toBe('—');
  });
});

describe('dates in the workspace time zone', () => {
  // 2026-11-18T22:30Z is 17:30 in New York, 02:30 next day in Dubai and 03:30 in Karachi.
  const instant = '2026-11-18T22:30:00.000Z';

  it('formats the date per zone', () => {
    expect(formatDate(instant, US)).toBe('18 Nov 2026');
    expect(formatDate(instant, AE)).toBe('19 Nov 2026');
    expect(formatDate(instant, GB)).toBe('18 Nov 2026');
    expect(formatDate(instant, PK)).toBe('19 Nov 2026');
  });

  it('formats time with the 12h/24h preference', () => {
    expect(strip(formatTime(instant, US)).toLowerCase()).toBe('5:30 pm');
    expect(strip(formatTime(instant, GB))).toBe('22:30');
  });

  it('treats date-only strings as calendar dates', () => {
    expect(formatDate('2026-12-10', AE)).toBe('10 Dec 2026');
  });

  it('computes today and day boundaries per zone', () => {
    const now = new Date(instant);
    expect(isToday('2026-11-18T15:00:00Z', US.timezone, now)).toBe(true);
    expect(isToday('2026-11-18T15:00:00Z', AE.timezone, now)).toBe(false);
    expect(dayKey(now, PK.timezone)).toBe('2026-11-19');
    expect(startOfDayInTz(now, AE.timezone).toISOString()).toBe('2026-11-18T20:00:00.000Z');
    expect(startOfDayInTz(now, GB.timezone).toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });

  it('handles DST in New York', () => {
    expect(startOfDayInTz(new Date('2026-07-01T12:00:00Z'), US.timezone).toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(startOfDayInTz(new Date('2026-12-01T12:00:00Z'), US.timezone).toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('flags overdue instants', () => {
    const now = new Date(instant);
    expect(isOverdue('2026-11-18T22:00:00Z', now)).toBe(true);
    expect(isOverdue('2026-11-18T23:00:00Z', now)).toBe(false);
  });

  it('formats relative times', () => {
    const now = new Date(instant);
    expect(formatRelative('2026-11-18T22:25:00Z', US, now)).toBe('5 min. ago');
    expect(formatRelative('2026-11-17T22:30:00Z', US, now)).toBe('yesterday');
    expect(formatRelative('2026-11-19T00:30:00Z', GB, now)).toBe('in 2 hr');
  });
});

describe('formatArea', () => {
  it('uses the workspace unit and converts', () => {
    expect(formatArea(1200, US)).toBe('1,200 sq ft');
    expect(formatArea(100, GB)).toBe('100 m²');
    expect(formatArea(100, US, 'sqm')).toBe('1,076 sq ft');
  });
});
