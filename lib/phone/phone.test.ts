import { describe, expect, it } from 'vitest';
import { formatPhone, parsePhone, waLink } from './index';

describe('parsePhone', () => {
  it.each([
    ['(212) 555-0123', 'US', '+12125550123'],
    ['050 123 4567', 'AE', '+971501234567'],
    ['07700 900123', 'GB', '+447700900123'],
    ['0300-1234567', 'PK', '+923001234567'],
    ['+44 7700 900123', 'US', '+447700900123'],
    ['00971501234567', 'GB', '+971501234567'],
  ])('%s in %s → %s', (input, country, e164) => {
    const r = parsePhone(input, country);
    expect(r.ok && r.e164).toBe(e164);
  });

  it('rejects junk', () => {
    expect(parsePhone('', 'US')).toEqual({ ok: false, error: 'empty' });
    expect(parsePhone('12', 'US').ok).toBe(false);
    expect(parsePhone('abc', 'US').ok).toBe(false);
  });
});

describe('formatPhone', () => {
  it('uses national format at home and international abroad', () => {
    expect(formatPhone('+12125550123', 'auto', 'US')).toBe('(212) 555-0123');
    expect(formatPhone('+12125550123', 'auto', 'GB')).toBe('+1 212 555 0123');
    expect(formatPhone('+971501234567', 'auto', 'AE')).toBe('050 123 4567');
    expect(formatPhone('+447700900123', 'auto', 'GB')).toBe('07700 900123');
    expect(formatPhone('+923001234567', 'auto', 'PK')).toBe('0300 1234567');
  });

  it('builds wa.me links from E.164', () => {
    expect(waLink('+447700900123', 'Hi there')).toBe('https://wa.me/447700900123?text=Hi%20there');
  });
});
