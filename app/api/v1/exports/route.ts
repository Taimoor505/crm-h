import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState, writeAuditLog } from '@/lib/taimoor/store';

function csvEscape(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const entity = body?.entity === 'deals' ? 'deals' : 'contacts';
    const { state, ctx } = auth;

    let csv = '';
    let rowCount = 0;

    if (entity === 'contacts') {
      const rows = state.contacts.filter(
        (c) =>
          c.workspace_id === ctx.workspace.id &&
          !c.deleted_at &&
          canSeeRecord(ctx, c.owner_id)
      );
      rowCount = rows.length;
      const header = ['id', 'name', 'phone_e164', 'email', 'source', 'status', 'tags', 'custom_json'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.id,
            r.name,
            r.phone_e164,
            r.email || '',
            r.source,
            r.status,
            r.tags.join('; '),
            JSON.stringify(r.custom),
          ]
            .map(csvEscape)
            .join(',')
        );
      }
      csv = '\uFEFF' + lines.join('\n');
    } else {
      const rows = state.deals.filter(
        (d) =>
          d.workspace_id === ctx.workspace.id &&
          !d.deleted_at &&
          canSeeRecord(ctx, d.owner_id)
      );
      rowCount = rows.length;
      const header = ['id', 'title', 'value_pkr', 'stage_id', 'contact_id', 'expected_close', 'custom_json'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [
            r.id,
            r.title,
            r.value_pkr,
            r.stage_id,
            r.contact_id,
            r.expected_close || '',
            JSON.stringify(r.custom),
          ]
            .map(csvEscape)
            .join(',')
        );
      }
      csv = '\uFEFF' + lines.join('\n');
    }

    writeAuditLog(state, {
      workspace_id: ctx.workspace.id,
      actor_id: ctx.user.id,
      action: 'data.exported',
      entity_type: entity,
      entity_id: null,
      meta: { row_count: rowCount },
    });
    saveState(state);

    return NextResponse.json({
      entity,
      row_count: rowCount,
      file_name: `${ctx.workspace.template_key}_${entity}_export.csv`,
      mime_type: 'text/csv; charset=utf-8',
      csv_content: csv,
    });
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 400 });
  }
}
