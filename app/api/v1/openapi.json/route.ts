import { NextRequest, NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/taimoor/openapi';
import { logged } from '@/server/observability/request-log';

async function GET_handler(req: NextRequest) {
  const origin = req.nextUrl.origin || 'http://localhost:3000';
  const spec = buildOpenApiSpec(origin);
  return NextResponse.json(spec, {
    headers: {
      'Content-Disposition': 'inline; filename="taimoor-openapi-v1.json"',
    },
  });
}

export const GET = logged(GET_handler);
