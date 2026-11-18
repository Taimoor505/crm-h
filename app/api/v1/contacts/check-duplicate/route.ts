import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const rawPhone = req.nextUrl.searchParams.get('phone');
  const norm = normalizePhoneToE164(rawPhone);
  if (!norm.valid || !norm.e164) {
    return NextResponse.json(
      {
        valid: false,
        error: norm.error || 'Invalid phone number',
        input: rawPhone,
      },
      { status: 400 }
    );
  }

  const { state, ctx } = auth;
  const match = state.contacts.find(
    (c) =>
      c.workspace_id === ctx.workspace.id &&
      c.phone_e164 === norm.e164 &&
      !c.deleted_at
  );

  return NextResponse.json({
    input: rawPhone,
    normalized_e164: norm.e164,
    national_format: norm.nationalFormat,
    carrier_type: norm.carrierType,
    duplicate_found: Boolean(match),
    existing_contact: match
      ? {
          id: match.id,
          name: match.name,
          phone_e164: match.phone_e164,
          owner_id: match.owner_id,
          status: match.status,
        }
      : null,
  });
}
