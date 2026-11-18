import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const job = auth.state.imports.find(
    (j) => j.id === id && j.workspace_id === auth.ctx.workspace.id
  );
  if (!job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (req.nextUrl.searchParams.get('format') === 'error_csv') {
    const lines = ['row,phone,reason'];
    for (const err of job.errors) {
      const safeReason = `"${String(err.reason).replace(/"/g, '""')}"`;
      lines.push(`${err.row},"${err.phone || ''}",${safeReason}`);
    }
    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="import_errors_${job.id.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({ import_job: job });
}
