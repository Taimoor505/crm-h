import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as plans from '@/app/api/v1/billing/plans/route';
import * as subscription from '@/app/api/v1/billing/subscription/route';
import * as invoices from '@/app/api/v1/billing/invoices/route';
import * as payments from '@/app/api/v1/billing/payments/route';
import * as statement from '@/app/api/v1/billing/commission-statement/route';
import * as collections from '@/app/api/v1/billing/collections/route';
import * as adminPartners from '@/app/api/v1/admin/partners/route';
import * as adminSuspend from '@/app/api/v1/admin/partners/[id]/suspend/route';
import * as adminPayments from '@/app/api/v1/admin/payments/route';
import * as adminConfirm from '@/app/api/v1/admin/payments/[id]/confirm/route';
import * as adminExtend from '@/app/api/v1/admin/trials/[id]/extend/route';
import * as adminRun from '@/app/api/v1/admin/billing/run/route';
import * as tasks from '@/app/api/v1/tasks/route';
import { closeDb, withService } from '@/server/db';
import { setStorageDriver } from '@/server/storage';
import { enforceBilling } from '@/server/billing/access';
import { runMonthlyBilling } from '@/server/billing/run';
import { admin, addMember, call, createUser, minutesFromNow } from './helpers';

/** 'YYYY-MM-01' n months from the current billing month (Asia/Karachi). */
let M0 = '';
function month(n: number): string {
  const [y, m] = M0.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
const ym = (date: string) => date.slice(0, 7);

let superAdmin: string;

async function partner(name: string, workspaces: number) {
  const [p] = await admin<{ id: string }[]>`insert into public.partners (name) values (${name}) returning id`;
  const adminUser = await createUser(`${name} admin`);
  await admin`insert into public.partner_members (partner_id, user_id) values (${p.id}, ${adminUser})`;
  const ws: string[] = [];
  for (let i = 1; i <= workspaces; i++) ws.push(await clientWorkspace(p.id, `${name} client ${i}`));
  return { id: p.id, admin: adminUser, ws };
}

async function clientWorkspace(partnerId: string, name: string) {
  const [w] = await admin<{ id: string }[]>`
    insert into public.workspaces (partner_id, name, created_at) values (${partnerId}, ${name}, now() - interval '60 days') returning id`;
  return w.id;
}

const asPartner = (p: { id: string; admin: string }) => ({ as: p.admin, headers: { 'x-partner-id': p.id } });
const asAdmin = () => ({ as: superAdmin });

async function invoicesFor(subscriptionId: string) {
  return admin`select id, number, period_start::text, status, total_pkr::float as total
                 from public.partner_invoices where subscription_id = ${subscriptionId} order by period_start, number`;
}

beforeAll(async () => {
  [{ m: M0 }] = await admin`select date_trunc('month', now() at time zone 'Asia/Karachi')::date::text as m`;
  superAdmin = await createUser('Platform Admin');
  await admin`insert into public.platform_admins (user_id) values (${superAdmin})`;
  setStorageDriver({
    async upload(bucket, path) { return { path: `${bucket}/${path}` }; },
    async signedUrl(p) { return `https://storage.test/${p}?token=x`; },
  });
});

beforeEach(() => {});

afterAll(async () => {
  await closeDb();
});

describe('access', () => {
  it('lists plans to any signed-in user', async () => {
    const someone = await createUser('Someone');
    const res = await call(plans.GET, { as: someone });
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string; price_per_month_pkr: number | null }) => [p.id, p.price_per_month_pkr])).toEqual([
      ['commission', null], ['monthly', 1500], ['quarterly', 1200], ['annual', 900],
    ]);
    expect((await call(plans.GET, {})).status).toBe(401);
  });

  it('allows partner admins and direct-customer owners only', async () => {
    const p = await partner('Gatekeepers', 1);
    const stranger = await createUser('Stranger');
    expect((await call(subscription.GET, { as: stranger, headers: { 'x-partner-id': p.id } })).body.error.code).toBe('not_partner_admin');
    expect((await call(subscription.GET, { as: stranger })).body.error.code).toBe('billing_account_required');

    const owner = await createUser('Client owner');
    await addMember(p.ws[0], owner, 'owner');
    const res = await call(subscription.GET, { as: owner, ws: p.ws[0] });
    expect(res.body.error.code).toBe('billed_by_partner');

    expect((await call(adminPartners.GET, { as: p.admin })).body.error.code).toBe('not_platform_admin');
  });
});

describe('free first month and prepaid plans', () => {
  let p: Awaited<ReturnType<typeof partner>>;
  let subId: string;

  it('starts a trial once per real business, whatever the brand name', async () => {
    p = await partner('Lahore Leads', 6);
    const res = await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'monthly', identity: 'NTN 1234567-8' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ trial: true, invoice_id: null });
    expect(res.body.data).toMatchObject({ subscription: { status: 'trialing', plan_id: 'monthly' }, trial: { free_workspaces: 5 }, workspaces: { count: 6 } });
    subId = res.body.data.subscription.id;

    // Same NTN under a new brand: no second free month, invoiced straight away.
    const rebrand = await partner('Lahore Leads 2.0', 2);
    const r2 = await call(subscription.POST, { method: 'POST', ...asPartner(rebrand), body: { plan_id: 'monthly', identity: '12345678' } });
    expect(r2.status).toBe(201);
    expect(r2.body.trial).toBe(false);
    const inv = await invoicesFor(r2.body.data.subscription.id);
    expect(inv).toEqual([expect.objectContaining({ period_start: M0, status: 'issued', total: 3000 })]);

    // A second subscription for the same account is a plan change, not a new one.
    const again = await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'quarterly' } });
    expect(again.status).toBe(200);
    expect(again.body.data.subscription).toMatchObject({ plan_id: 'quarterly', pending_plan_id: null }); // trial: immediate
    await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'monthly' } });
  });

  it('during the trial only workspaces beyond the first 5 are billed', async () => {
    await admin`update public.subscriptions set trial_ends_at = (${month(1)}::date + 10)::timestamp at time zone 'Asia/Karachi'
                 where id = ${subId}`;
    await admin`update public.billing_trials set ends_at = (${month(1)}::date + 10)::timestamp at time zone 'Asia/Karachi'
                 where subscription_id = ${subId}`;
    await withService((tx) => runMonthlyBilling(tx, month(1)));
    const inv = await invoicesFor(subId);
    expect(inv).toEqual([expect.objectContaining({ period_start: month(1), total: 1500 })]);
    const [line] = await admin`select description from public.invoice_lines where invoice_id = ${inv[0].id}`;
    expect(line.description).toBe('Lahore Leads client 6: beyond the 5 free trial workspaces, ' +
      new Date(`${month(1)}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }));
  });

  it('after the trial, every workspace is billed for the period; re-running changes nothing', async () => {
    const first = await withService((tx) => runMonthlyBilling(tx, month(2)));
    const second = await withService((tx) => runMonthlyBilling(tx, month(2)));
    expect(second).toMatchObject({ invoices: 0, failed: 0 });
    expect(first.failed).toBe(0);
    const inv = (await invoicesFor(subId)).filter((i) => i.period_start === month(2));
    expect(inv).toEqual([expect.objectContaining({ total: 9000, status: 'issued' })]);
    const [s] = await admin`select status, period_start::text, period_end::text from public.subscriptions where id = ${subId}`;
    expect(s).toEqual({ status: 'active', period_start: month(2), period_end: month(3) });
  });

  it('plan change waits for the end of the paid period, then bills the new plan', async () => {
    const res = await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'quarterly' } });
    expect(res.body.data).toMatchObject({ subscription: { plan_id: 'monthly', pending_plan_id: 'quarterly' }, pending_plan_effective: month(3) });
    await withService((tx) => runMonthlyBilling(tx, month(3)));
    const [s] = await admin`select plan_id, pending_plan_id, period_start::text, period_end::text from public.subscriptions where id = ${subId}`;
    expect(s).toEqual({ plan_id: 'quarterly', pending_plan_id: null, period_start: month(3), period_end: month(6) });
    expect((await invoicesFor(subId)).find((i) => i.period_start === month(3))!.total).toBe(6 * 3600);
  });

  it('a workspace added mid-quarter pays for the months left; nothing new is billed for the others', async () => {
    await clientWorkspace(p.id, 'Lahore Leads client 7');
    await withService((tx) => runMonthlyBilling(tx, month(4)));
    const inv = (await invoicesFor(subId)).find((i) => i.period_start === month(4))!;
    expect(inv.total).toBe(2 * 1200);
    const lines = await admin`select description from public.invoice_lines where invoice_id = ${inv.id}`;
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain('client 7');
    expect(lines[0].description).toContain('joined mid-period, 2 months');
    // Month 5: still inside the paid quarter → nothing due.
    expect((await withService((tx) => runMonthlyBilling(tx, month(5))))).toMatchObject({ failed: 0 });
    expect((await invoicesFor(subId)).find((i) => i.period_start === month(5))).toBeUndefined();
  });

  it('extending a trial needs it to still be running', async () => {
    const res = await call(adminExtend.POST, { method: 'POST', ...asAdmin(), params: { id: subId }, body: { days: 7 } });
    expect(res.body.error.code).toBe('not_trialing');
  });
});

describe('commission plan', () => {
  let p: Awaited<ReturnType<typeof partner>>;
  let subId: string;

  it('bills 30% of reported collections in arrears, with the Rs. 300 floor, plus WhatsApp at cost', async () => {
    p = await partner('Commission Co', 2);
    const res = await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'commission' } });
    subId = res.body.data.subscription.id;
    expect(res.body.invoice_id).toBeNull(); // nothing to bill for a month that hasn't happened

    // This month: client 1 collected Rs. 10,000; client 2 nothing reported.
    const put = await call(collections.PUT, {
      method: 'PUT', ...asPartner(p), body: { month: ym(M0), items: [{ workspace_id: p.ws[0], amount_collected_pkr: 10_000 }] },
    });
    expect(put.status).toBe(200);
    expect((await call(collections.PUT, {
      method: 'PUT', ...asPartner(p), body: { month: ym(month(1)), items: [{ workspace_id: p.ws[0], amount_collected_pkr: 1 }] },
    })).body.error.code).toBe('future_month');
    await admin`insert into public.usage_counters (workspace_id, period, whatsapp_sent, whatsapp_cost_pkr)
                values (${p.ws[1]}, ${M0}, 40, 180)`;

    const preview = await call(statement.GET, { ...asPartner(p), query: { month: ym(M0) } });
    expect(preview.body.data).toMatchObject({ applies: true, total_collected_pkr: 10_000, total_commission_pkr: 3300 });

    // Pretend the subscription started last month so this month counts.
    await admin`update public.subscriptions set created_at = ${M0}::date - interval '1 day' where id = ${subId}`;
    await withService((tx) => runMonthlyBilling(tx, month(1)));
    const [inv] = await invoicesFor(subId);
    expect(inv.total).toBe(3000 + 300 + 180);
    const lines = await admin`select kind, amount_pkr::float as amount, description from public.invoice_lines
                               where invoice_id = ${inv.id} order by amount desc`;
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([['commission', 3000], ['commission', 300], ['whatsapp_passthrough', 180]]);
    expect(lines[1].description).toContain('(monthly minimum Rs. 300)');

    const st = await call(statement.GET, { ...asPartner(p), query: { month: ym(M0) } });
    expect(st.body.data.workspaces.map((w: { status: string }) => w.status)).toEqual(['invoiced', 'invoiced']);
    const late = await call(collections.PUT, {
      method: 'PUT', ...asPartner(p), body: { month: ym(M0), items: [{ workspace_id: p.ws[0], amount_collected_pkr: 99 }] },
    });
    expect(late.body.error.code).toBe('already_invoiced');
  });

  it('only accepts collections for its own clients and on the commission plan', async () => {
    const other = await partner('Prepaid Pvt', 1);
    await call(subscription.POST, { method: 'POST', ...asPartner(other), body: { plan_id: 'monthly' } });
    expect((await call(collections.PUT, {
      method: 'PUT', ...asPartner(other), body: { month: ym(M0), items: [{ workspace_id: other.ws[0], amount_collected_pkr: 1 }] },
    })).body.error.code).toBe('not_commission_plan');
    expect((await call(collections.PUT, {
      method: 'PUT', ...asPartner(p), body: { month: ym(M0), items: [{ workspace_id: other.ws[0], amount_collected_pkr: 1 }] },
    })).body.error.code).toBe('invalid_workspaces');
  });
});

describe('unpaid invoices, payments and suspension', () => {
  let p: Awaited<ReturnType<typeof partner>>;
  let owner: string;
  let subId: string;
  let invoiceId: string;
  let paymentId: string;

  it('a direct customer can subscribe for their own workspace', async () => {
    const [house] = await admin`select id from public.partners where is_house limit 1`;
    const houseId = house?.id ?? (await admin`insert into public.partners (name, is_house) values ('House', true) returning id`)[0].id;
    const ws = await clientWorkspace(houseId, 'Direct Dental');
    const o = await createUser('Dr. Direct');
    await addMember(ws, o, 'owner');
    const res = await call(subscription.POST, { method: 'POST', as: o, ws, body: { plan_id: 'annual' } });
    expect(res.status).toBe(201);
    expect(res.body.data.workspaces.count).toBe(1);
    const inv = await invoicesFor(res.body.data.subscription.id);
    expect(inv[0].total).toBe(10_800);
  });

  it('goes read-only after the due date, then archived after 30 days, and owners are told', async () => {
    p = await partner('Late Payers', 1);
    owner = await createUser('Late owner');
    await addMember(p.ws[0], owner, 'owner');
    const res = await call(subscription.POST, { method: 'POST', ...asPartner(p), body: { plan_id: 'monthly' } });
    subId = res.body.data.subscription.id;
    invoiceId = res.body.invoice_id;

    // Not due yet: nothing happens.
    await withService(enforceBilling);
    expect((await admin`select status from public.workspaces where id = ${p.ws[0]}`)[0].status).toBe('active');

    await admin`update public.partner_invoices set issue_date = current_date - 8, due_date = current_date - 1 where id = ${invoiceId}`;
    expect(await withService(enforceBilling)).toMatchObject({ read_only: 1 });
    expect((await admin`select status from public.workspaces where id = ${p.ws[0]}`)[0].status).toBe('read_only');
    const write = await call(tasks.POST, { method: 'POST', as: owner, ws: p.ws[0], body: { type: 'call', due_at: minutesFromNow(60) } });
    expect(write.body.error.code).toBe('workspace_read_only');
    expect((await call(tasks.GET, { as: owner, ws: p.ws[0] })).status).toBe(200);
    const [n] = await admin`select title, priority from public.notifications where user_id = ${owner} and type = 'billing.read_only'`;
    expect(n).toEqual({ title: 'Your CRM is read-only: invoice unpaid', priority: 'urgent' });

    await admin`update public.partner_invoices set issue_date = current_date - 31 where id = ${invoiceId}`;
    expect(await withService(enforceBilling)).toMatchObject({ archived: 1 });
    expect((await admin`select status from public.workspaces where id = ${p.ws[0]}`)[0].status).toBe('archived');
    expect((await call(tasks.GET, { as: owner, ws: p.ws[0] })).status).toBe(200); // data kept, readable
  });

  it('partner uploads proof; super-admin confirms; access comes back', async () => {
    const fd = new FormData();
    fd.set('invoice_id', invoiceId);
    fd.set('amount_pkr', '1500');
    fd.set('method', 'jazzcash');
    fd.set('reference', 'TXN-778899');
    fd.set('proof', new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' }));
    const res = await call(payments.POST, { method: 'POST', ...asPartner(p), rawBody: fd });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', amount_pkr: 1500, method: 'jazzcash' });
    paymentId = res.body.data.id;

    const bad = new FormData();
    bad.set('invoice_id', invoiceId); bad.set('amount_pkr', '1500'); bad.set('method', 'jazzcash');
    bad.set('proof', new File(['x'], 'x.exe', { type: 'application/octet-stream' }));
    expect((await call(payments.POST, { method: 'POST', ...asPartner(p), rawBody: bad })).body.error.code).toBe('invalid_proof');

    const queue = await call(adminPayments.GET, asAdmin());
    const mine = queue.body.data.find((x: { id: string }) => x.id === paymentId);
    expect(mine).toMatchObject({ partner_name: 'Late Payers', invoice_total_pkr: 1500 });
    expect(mine.proof_download_url).toMatch(/^https:\/\/storage\.test\/payment-proofs\//);

    const ok = await call(adminConfirm.POST, { method: 'POST', ...asAdmin(), params: { id: paymentId }, body: { approve: true } });
    expect(ok.body.data).toMatchObject({ status: 'confirmed', invoice_paid: true, access_restored: true });
    expect((await admin`select status from public.workspaces where id = ${p.ws[0]}`)[0].status).toBe('active');
    expect((await admin`select status from public.subscriptions where id = ${subId}`)[0].status).toBe('active');
    expect((await call(adminConfirm.POST, { method: 'POST', ...asAdmin(), params: { id: paymentId }, body: {} })).body.error.code)
      .toBe('already_reviewed');

    const list = await call(invoices.GET, asPartner(p));
    expect(list.body.data[0]).toMatchObject({ status: 'paid', paid_pkr: 1500, lines: [expect.objectContaining({ amount_pkr: 1500 })] });
  });

  it('suspension blocks everything until lifted; the admin list shows it', async () => {
    const res = await call(adminSuspend.POST, { method: 'POST', ...asAdmin(), params: { id: p.id }, body: { suspended: true, reason: 'chargeback' } });
    expect(res.body.data).toMatchObject({ suspended: true, workspaces: 1 });
    expect((await call(tasks.GET, { as: owner, ws: p.ws[0] })).body.error.code).toBe('workspace_suspended');

    const list = await call(adminPartners.GET, { ...asAdmin(), query: { status: 'suspended' } });
    expect(list.body.data.map((x: { name: string }) => x.name)).toEqual(['Late Payers']);

    await call(adminSuspend.POST, { method: 'POST', ...asAdmin(), params: { id: p.id }, body: { suspended: false } });
    expect((await call(tasks.GET, { as: owner, ws: p.ws[0] })).status).toBe(200);
  });

  it('the admin can run billing by hand, and repeating it is harmless', async () => {
    const r1 = await call(adminRun.POST, { method: 'POST', ...asAdmin(), body: { month: ym(month(6)) } });
    const r2 = await call(adminRun.POST, { method: 'POST', ...asAdmin(), body: { month: ym(month(6)) } });
    expect(r1.body.data.failed).toBe(0);
    expect(r2.body.data).toMatchObject({ invoices: 0, failed: 0 });
  });
});
