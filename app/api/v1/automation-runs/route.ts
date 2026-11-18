import { z } from 'zod';
import { decodeCursor, encodeCursor, json, limitSchema, readQuery, userRoute } from '@/server/http';
import { AUTOMATION_KEYS } from '@/server/automations/catalog';

const schema = z.object({
  automation_key: z.enum(AUTOMATION_KEYS).optional(),
  status: z.enum(['success', 'skipped', 'failed']).optional(),
  contact_id: z.uuid().optional(),
  deal_id: z.uuid().optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
});

// GET /automation-runs (managers): "why did this message go out?"
export const GET = userRoute({ managerOnly: true }, async ({ req, tx, workspace }) => {
  const q = readQuery(req, schema);
  const cursor = decodeCursor<{ c: string; id: string }>(q.cursor);
  const where = tx`and`.join([
    tx`r.workspace_id = ${workspace.id}`,
    q.automation_key && tx`r.automation_key = ${q.automation_key}`,
    q.status && tx`r.status = ${q.status}`,
    q.contact_id && tx`r.contact_id = ${q.contact_id}`,
    q.deal_id && tx`r.deal_id = ${q.deal_id}`,
    cursor && tx`(r.created_at, r.id) < (${cursor.c}::timestamptz, ${cursor.id}::uuid)`,
  ]);
  const rows = await tx<{ id: string; created_at_text: string }[]>`
    select r.id, r.automation_key, r.trigger_event, r.contact_id, r.deal_id, r.status, r.result, r.error,
           r.created_at, r.created_at::text as created_at_text,
           c.name as contact_name, c.phone_e164 as contact_phone
      from public.automation_runs r
      left join public.contacts c on c.id = r.contact_id
     where ${where}
     order by r.created_at desc, r.id desc
     limit ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return json({
    data: page.map(({ created_at_text: _t, ...r }) => r),
    next_cursor: rows.length > q.limit && last ? encodeCursor({ c: last.created_at_text, id: last.id }) : null,
  });
});
