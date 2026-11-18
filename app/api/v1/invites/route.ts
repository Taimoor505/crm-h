import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { saveState, writeAuditLog } from '@/lib/taimoor/store';
import { Role } from '@/lib/taimoor/types';

export async function POST(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const roleErr = requireManagerOrOwner(auth.ctx);
  if (roleErr) {
    return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });
  }

  try {
    const body = await req.json();
    const norm = normalizePhoneToE164(body?.phone);
    if (!norm.valid || !norm.e164) {
      return NextResponse.json({ error: norm.error || 'Invalid phone number' }, { status: 400 });
    }

    const role: Role = ['owner', 'manager', 'agent'].includes(body?.role)
      ? body.role
      : 'agent';
    const { state, ctx } = auth;
    const now = new Date().toISOString();

    let user = state.users.find((u) => u.phone === norm.e164);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        phone: norm.e164,
        email: body?.email ? String(body.email) : `${norm.e164.replace('+', '')}@team.taimoor.pk`,
        name: body?.name ? String(body.name) : `Invited Member ${norm.nationalFormat}`,
        locale: body?.locale === 'ur' ? 'ur' : 'en',
        partner_admin_of: null,
        created_at: now,
      };
      state.users.push(user);
    }

    const existingMembership = state.memberships.find(
      (m) => m.user_id === user!.id && m.workspace_id === ctx.workspace.id
    );
    if (existingMembership) {
      return NextResponse.json(
        { error: 'User is already a member of this workspace', membership: existingMembership },
        { status: 409 }
      );
    }

    const membership = {
      id: crypto.randomUUID(),
      user_id: user.id,
      workspace_id: ctx.workspace.id,
      role,
      status: 'active' as const,
      created_at: now,
    };
    state.memberships.push(membership);

    writeAuditLog(state, {
      workspace_id: ctx.workspace.id,
      actor_id: ctx.user.id,
      action: 'membership.invited',
      entity_type: 'membership',
      entity_id: membership.id,
      meta: { invited_phone: norm.e164, role },
    });

    saveState(state);
    return NextResponse.json({ membership, user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
