import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { checkRateLimit } from '@/lib/taimoor/rate-limit';
import { getState, saveState } from '@/lib/taimoor/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const norm = normalizePhoneToE164(body?.phone);
    if (!norm.valid || !norm.e164) {
      return NextResponse.json(
        { error: norm.error || 'Invalid Pakistani or international phone number' },
        { status: 400 }
      );
    }

    const rl = checkRateLimit(`otp_send:${norm.e164}`, 5, 60_000);
    const headers = {
      'X-RateLimit-Limit': String(rl.limit),
      'X-RateLimit-Remaining': String(rl.remaining),
      'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
    };

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for OTP requests. Please wait 60 seconds.' },
        { status: 429, headers }
      );
    }

    const state = getState();
    // Deterministic dev code 482910 or random 6-digit; include sandbox_preview_code for developer workbench testing
    const code = '482910';
    state.otp_challenges = state.otp_challenges.filter(
      (c) => c.phone_e164 !== norm.e164
    );
    state.otp_challenges.push({
      id: crypto.randomUUID(),
      phone_e164: norm.e164,
      code,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      verified: false,
    });
    saveState(state);

    return NextResponse.json(
      {
        sent: true,
        phone_e164: norm.e164,
        expires_in_seconds: 300,
        sandbox_code: code,
      },
      { headers }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
