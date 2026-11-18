import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as reports from '@/app/api/v1/reports/[name]/route';
import { closeDb } from '@/server/db';
import { admin, call, team } from './helpers';

let t: Awaited<ReturnType<typeof team>>;
let pipeline: string;
const st: Record<string, string> = {};
const OCT = { from: '2026-10-01', to: '2026-10-31' };

const get = (name: string, query: Record<string, string> = {}, as = t.manager) =>
  call(reports.GET, { as, ws: t.ws, params: { name }, query: { ...OCT, ...query } });

/** A lead created at `at` (PKT), owned by `owner`, first answered `respondMin` later. */
async function lead(at: string, source: string, owner: string | null, respondMin: number | null, kind = 'lead_received') {
  const created = new Date(`${at}+05:00`);
  const [c] = await admin<{ id: string }[]>`
    insert into public.contacts (workspace_id, phone_e164, source, owner_id, created_at, last_enquiry_at, first_response_at)
    values (${t.ws}, ${'+92300' + Math.floor(1e6 + Math.random() * 8.9e6)}, ${source}, ${owner}, ${created}, ${created},
            ${respondMin === null ? null : new Date(created.getTime() + respondMin * 60_000)})
    returning id`;
  await admin`insert into public.activities (workspace_id, contact_id, type, body, meta, created_at)
              values (${t.ws}, ${c.id}, 'system', 'lead', ${admin.json({ kind, source_label: source })}, ${created})`;
  if (owner) {
    await admin`insert into public.activities (workspace_id, contact_id, type, meta, created_at)
                values (${t.ws}, ${c.id}, 'assignment', ${admin.json({ to: owner, reason: 'new_lead' })}, ${created})`;
  }
  return c.id;
}

async function deal(stage: string, owner: string, opts: { created: string; entered: string; value?: number; lostReason?: string;
  history?: string[]; contact?: string }) {
  const [d] = await admin<{ id: string }[]>`
    insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value_pkr, owner_id, lost_reason, created_at, stage_entered_at)
    values (${t.ws}, ${pipeline}, ${st[stage]}, ${opts.contact ?? null}, ${'Deal'}, ${opts.value ?? null}, ${owner}, ${opts.lostReason ?? null},
            ${new Date(`${opts.created}+05:00`)}, ${new Date(`${opts.entered}+05:00`)})
    returning id`;
  for (const h of opts.history ?? []) {
    await admin`insert into public.activities (workspace_id, deal_id, type, meta, created_at)
                values (${t.ws}, ${d.id}, 'stage_change', ${admin.json({ to_stage_id: st[h] })}, ${new Date(`${opts.created}+05:00`)})`;
  }
  return d.id;
}

beforeAll(async () => {
  t = await team('Report Realty');
  const [p] = await admin<{ id: string }[]>`insert into public.pipelines (workspace_id, name) values (${t.ws}, 'Plots') returning id`;
  pipeline = p.id;
  for (const [name, pos, kind] of [['New', 0, 'open'], ['Contacted', 1, 'open'], ['Visit', 2, 'open'], ['Won', 3, 'won'], ['Lost', 4, 'lost']] as const) {
    st[name] = (await admin<{ id: string }[]>`insert into public.stages (pipeline_id, name, position, kind) values (${pipeline}, ${name}, ${pos}, ${kind}) returning id`)[0].id;
  }

  // Leads (PKT times). Ali: 2 min and 30 min; Sara: 4 min, 10 min, never. One unassigned.
  await lead('2026-10-01T00:30:00', 'facebook', t.ali, 2);          // Oct 1 local, Sep 30 in UTC
  await lead('2026-10-05T11:00:00', 'facebook', t.ali, 30);
  await lead('2026-10-05T12:00:00', 'website', t.sara, 4);
  await lead('2026-10-06T09:00:00', 'website', t.sara, 10);
  await lead('2026-10-07T09:00:00', 'website', t.sara, null);
  await lead('2026-10-08T09:00:00', 'zameen', null, null);
  await lead('2026-10-09T09:00:00', 'facebook', t.ali, null, 're_enquiry');
  await lead('2026-11-01T00:10:00', 'facebook', t.ali, 1);          // outside October (local)

  // Deals created in October. Funnel: 6 deals.
  await deal('New', t.ali, { created: '2026-10-02T10:00:00', entered: '2026-10-02T10:00:00' });
  await deal('Contacted', t.ali, { created: '2026-10-02T10:00:00', entered: '2026-10-03T10:00:00', history: ['Contacted'] });
  await deal('Visit', t.sara, { created: '2026-10-03T10:00:00', entered: '2026-10-04T10:00:00', history: ['Contacted', 'Visit'] });
  await deal('Won', t.ali, { created: '2026-10-03T10:00:00', entered: '2026-10-20T10:00:00', value: 5_000_000 });
  await deal('Lost', t.sara, { created: '2026-10-04T10:00:00', entered: '2026-10-10T10:00:00', value: 2_000_000,
    lostReason: 'Budget', history: ['Contacted'] });
  await deal('Lost', t.ali, { created: '2026-10-04T10:00:00', entered: '2026-10-11T10:00:00', lostReason: '' });
  // Won in September (deal created in Sept: not in October's funnel, not in October's won value).
  await deal('Won', t.sara, { created: '2026-09-01T10:00:00', entered: '2026-09-15T10:00:00', value: 9_000_000 });

  // Tasks: Ali completed 2 in October, Sara has 1 overdue open.
  await admin`insert into public.tasks (workspace_id, assigned_to, type, title, due_at, status, completed_at)
              values (${t.ws}, ${t.ali}, 'call', 'a', '2026-10-05', 'done', '2026-10-05T12:00:00+05'),
                     (${t.ws}, ${t.ali}, 'call', 'b', '2026-10-06', 'done', '2026-10-06T12:00:00+05'),
                     (${t.ws}, ${t.sara}, 'call', 'c', now() - interval '1 day', 'open', null)`;
});

afterAll(async () => {
  await closeDb();
});

describe('reports', () => {
  it('sources: by source and by local day, with re-enquiries', async () => {
    const res = await get('sources');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ from: '2026-10-01', to: '2026-10-31', total: 7 });
    expect(res.body.data.by_source).toEqual([
      { source: 'facebook', leads: 3, new: 2, reenquiries: 1 },
      { source: 'website', leads: 3, new: 3, reenquiries: 0 },
      { source: 'zameen', leads: 1, new: 1, reenquiries: 0 },
    ]);
    expect(res.body.data.by_day[0]).toEqual({ day: '2026-10-01', source: 'facebook', leads: 1 });
    const fb = await get('sources', { source: 'website' });
    expect(fb.body.data.total).toBe(3);
  });

  it('speed to lead: median and p90 per agent and overall', async () => {
    const res = await get('speed-to-lead');
    const { overall, by_agent } = res.body.data;
    // 7 lead contacts in October (incl. the re-enquiry row); responses 2, 30, 4, 10 min.
    expect(overall).toMatchObject({ leads: 7, responded: 4, median_seconds: 420, within_5_min: 2, within_1_hour: 4 });
    const ali = by_agent.find((a: { agent_id: string }) => a.agent_id === t.ali);
    expect(ali).toMatchObject({ agent_name: 'Ali', leads: 3, responded: 2, median_seconds: 960, within_5_min_pct: 33.3 });
    const sara = by_agent.find((a: { agent_id: string }) => a.agent_id === t.sara);
    expect(sara).toMatchObject({ leads: 3, responded: 2, median_seconds: 420, response_rate_pct: 66.7 });
  });

  it('funnel: reached counts per stage, conversion and win rate', async () => {
    // A malformed stage_change activity must not break the report.
    await admin`insert into public.activities (workspace_id, type, meta) values (${t.ws}, 'stage_change', '{"to_stage_id": "not-a-uuid"}')`;
    const res = await get('funnel', { pipeline_id: pipeline });
    const d = res.body.data;
    expect(d).toMatchObject({ deals: 6, won: 1, lost: 2, open: 3, win_rate_pct: 33.3 });
    expect(d.stages.map((s: { name: string; reached: number; current: number }) => [s.name, s.reached, s.current])).toEqual([
      ['New', 6, 1], ['Contacted', 4, 1], ['Visit', 2, 1], ['Won', 1, 1], ['Lost', 2, 2],
    ]);
    expect(d.stages[1].conversion_from_previous_pct).toBe(66.7);
    expect(d.stages[3].conversion_from_previous_pct).toBe(50);
  });

  it('agents: assigned, contacted, follow-ups done, overdue and deals won', async () => {
    const res = await get('agents');
    const by = Object.fromEntries(res.body.data.agents.map((a: { agent_id: string }) => [a.agent_id, a]));
    expect(by[t.ali]).toMatchObject({ assigned: 3, contacted: 2, follow_ups_done: 2, overdue: 0, deals_won: 1, won_value_pkr: 5_000_000 });
    expect(by[t.sara]).toMatchObject({ assigned: 3, contacted: 2, follow_ups_done: 0, overdue: 1, deals_won: 0 });
  });

  it('won value by month', async () => {
    const res = await get('won-value', { from: '2026-09-01' });
    expect(res.body.data).toMatchObject({
      total_value_pkr: 14_000_000, total_deals: 2,
      months: [{ month: '2026-09', deals: 1, value_pkr: 9_000_000 }, { month: '2026-10', deals: 1, value_pkr: 5_000_000 }],
    });
    expect((await get('won-value', { agent_id: t.ali, from: '2026-09-01' })).body.data.total_value_pkr).toBe(5_000_000);
  });

  it('lost reasons, with blanks as "Not specified"', async () => {
    const res = await get('lost-reasons');
    expect(res.body.data.reasons).toEqual([
      { reason: 'Budget', deals: 1, value_pkr: 2_000_000, share_pct: 50 },
      { reason: 'Not specified', deals: 1, value_pkr: 0, share_pct: 50 },
    ]);
  });

  it('agents only see their own numbers', async () => {
    const res = await get('agents', {}, t.ali);
    expect(res.body.data.agents.map((a: { agent_id: string }) => a.agent_id)).toEqual([t.ali]);
    const speed = await get('speed-to-lead', { agent_id: t.sara }, t.ali);
    expect(speed.body.data.by_agent.map((a: { agent_id: string }) => a.agent_id)).toEqual([t.ali]);
  });

  it('validates filters and names', async () => {
    expect((await get('nope')).status).toBe(404);
    expect((await get('sources', { from: '2026-11-01', to: '2026-10-01' })).status).toBe(422);
    expect((await get('funnel', { pipeline_id: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
  });
});
