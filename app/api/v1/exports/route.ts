import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';
import { loadWorkspace } from '@/server/core/workspaces';

const esc = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  // Neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

// POST /exports { entity: contacts|deals }: CSV of what the caller can see.
export const POST = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, z.object({ entity: z.enum(['contacts', 'deals']).default('contacts') }));
  const ws = await loadWorkspace(tx, workspace.id);
  const fields = await tx<{ key: string; label_en: string }[]>`
    select key, label_en from public.custom_field_defs
     where workspace_id = ${workspace.id} and entity = ${b.entity === 'contacts' ? 'contact' : 'deal'} order by position`;
  let lines: string[];
  let count: number;
  if (b.entity === 'contacts') {
    const rows = await tx`
      select c.name, c.phone_e164, c.email, c.source, c.status, c.tags, u.name as owner, c.custom, c.created_at
        from public.contacts c left join public.users u on u.id = c.owner_id
       where c.workspace_id = ${workspace.id} and c.deleted_at is null ${isManager ? tx`` : tx`and c.owner_id = ${userId}`}
       order by c.created_at desc limit 50000`;
    count = rows.length;
    lines = [
      ['Name', 'Phone', 'Email', 'Source', 'Status', 'Tags', 'Owner', ...fields.map((f) => f.label_en), 'Created'].map(esc).join(','),
      ...rows.map((r) => [r.name, r.phone_e164, r.email, r.source, r.status, (r.tags as string[]).join('|'), r.owner,
        ...fields.map((f) => (r.custom as Record<string, unknown>)[f.key]), r.created_at].map(esc).join(',')),
    ];
  } else {
    const rows = await tx`
      select d.title, d.value_minor, d.currency, p.name as pipeline, s.name as stage, c.name as contact, c.phone_e164,
             u.name as owner, d.expected_close, d.won_reason, d.lost_reason, d.custom, d.created_at
        from public.deals d join public.stages s on s.id = d.stage_id join public.pipelines p on p.id = d.pipeline_id
        join public.contacts c on c.id = d.contact_id left join public.users u on u.id = d.owner_id
       where d.workspace_id = ${workspace.id} and d.deleted_at is null ${isManager ? tx`` : tx`and d.owner_id = ${userId}`}
       order by d.created_at desc limit 50000`;
    count = rows.length;
    lines = [
      ['Title', 'Value', 'Currency', 'Pipeline', 'Stage', 'Contact', 'Phone', 'Owner', 'Expected close', 'Won reason', 'Lost reason', ...fields.map((f) => f.label_en), 'Created'].map(esc).join(','),
      ...rows.map((r) => [r.title, Number(r.value_minor) / 100, r.currency, r.pipeline, r.stage, r.contact, r.phone_e164, r.owner,
        r.expected_close, r.won_reason, r.lost_reason, ...fields.map((f) => (r.custom as Record<string, unknown>)[f.key]), r.created_at].map(esc).join(',')),
    ];
  }
  const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
  return json({
    entity: b.entity, row_count: count, file_name: `${slug}-${b.entity}-${new Date().toISOString().slice(0, 10)}.csv`,
    mime_type: 'text/csv; charset=utf-8', csv_content: lines.join('\n'),
  });
});
