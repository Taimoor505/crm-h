import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/server/core/phone';
import { applyMapping } from '@/server/leads/mapping';
import { verifyWebhook } from '@/server/leads/sources';
import { nextInRotation } from '@/server/assignment/engine';
import { windowStart } from '@/worker/scheduler';

describe('normalizePhone', () => {
  it.each([
    ['0300-1234567', '+923001234567'],
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['0092 300 1234567', '+923001234567'],
    ['(0300) 123-4567', '+923001234567'],
    ['+971 50 123 4567', '+971501234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '12345', '+0123456', '300123', null, undefined])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('applyMapping', () => {
  it('uses common field names when there is no mapping', () => {
    const lead = applyMapping({ Full_Name: 'Ahmed Khan', Mobile: '0300-1234567', Email: 'A@X.PK', message: 'DHA plot' });
    expect(lead).toMatchObject({ name: 'Ahmed Khan', phone: '0300-1234567', email: 'a@x.pk', notes: 'DHA plot' });
  });

  it('follows explicit paths, nested objects and custom fields', () => {
    const lead = applyMapping(
      { lead: { who: 'Sana', contact: { cell: '3211234567' } }, budget: '1.5 crore', area: 'Bahria' },
      { name: 'lead.who', phone: ['lead.contact.phone', 'lead.contact.cell'], custom: { budget: 'budget', city_area: 'area' }, tags: ['ppc'] },
    );
    expect(lead).toMatchObject({
      name: 'Sana',
      phone: '3211234567',
      custom: { budget: '1.5 crore', city_area: 'Bahria' },
      tags: ['ppc'],
    });
  });

  it('flattens Meta lead ads field_data', () => {
    const lead = applyMapping({
      field_data: [
        { name: 'full_name', values: ['Usman'] },
        { name: 'phone_number', values: ['+923331234567'] },
      ],
    });
    expect(lead).toMatchObject({ name: 'Usman', phone: '+923331234567' });
  });

  it('joins first and last name', () => {
    expect(applyMapping({ first_name: 'Ayesha', last_name: 'Malik', phone: '1' }).name).toBe('Ayesha Malik');
  });

  it('keeps Urdu text intact', () => {
    expect(applyMapping({ name: 'عائشہ ملک' }).name).toBe('عائشہ ملک');
  });
});

describe('verifyWebhook', () => {
  const secret = 'whsec_test';
  const body = '{"name":"x"}';
  it('accepts a valid HMAC signature', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyWebhook(secret, body, new Headers({ 'x-signature': sig }))).toBe(true);
  });
  it('rejects a signature over a different body', () => {
    const sig = `sha256=${createHmac('sha256', secret).update('{}').digest('hex')}`;
    expect(verifyWebhook(secret, body, new Headers({ 'x-signature': sig }))).toBe(false);
  });
  it('accepts the shared-secret header', () => {
    expect(verifyWebhook(secret, body, new Headers({ 'x-webhook-secret': secret }))).toBe(true);
    expect(verifyWebhook(secret, body, new Headers({ 'x-webhook-secret': 'nope' }))).toBe(false);
  });
  it('rejects requests with neither header', () => {
    expect(verifyWebhook(secret, body, new Headers())).toBe(false);
  });
});

describe('nextInRotation', () => {
  const order = ['a', 'b', 'c'];
  const all = new Set(order);
  it('starts at the beginning and wraps around', () => {
    expect(nextInRotation(order, undefined, all)).toBe('a');
    expect(nextInRotation(order, 'a', all)).toBe('b');
    expect(nextInRotation(order, 'c', all)).toBe('a');
  });
  it('skips unavailable and excluded people but keeps its place', () => {
    expect(nextInRotation(order, 'a', new Set(['a', 'c']))).toBe('c');
    expect(nextInRotation(order, 'a', all, new Set(['b']))).toBe('c');
    expect(nextInRotation(order, 'gone', all)).toBe('a');
  });
  it('returns null when nobody is eligible', () => {
    expect(nextInRotation(order, 'a', new Set())).toBeNull();
    expect(nextInRotation([], undefined, all)).toBeNull();
  });
});

describe('windowStart', () => {
  it('floors to the job interval', () => {
    const t = new Date('2026-11-18T10:07:42Z');
    expect(windowStart(t, 1).toISOString()).toBe('2026-11-18T10:07:00.000Z');
    expect(windowStart(t, 5).toISOString()).toBe('2026-11-18T10:05:00.000Z');
    expect(windowStart(t, 60).toISOString()).toBe('2026-11-18T10:00:00.000Z');
  });
});
