import { normalizePhoneToE164 } from '@/lib/taimoor/phone';

/**
 * E.164 normalisation is Taimoor's (lib/taimoor/phone.ts): Pakistani mobiles
 * and landlines, 00/+ international. Returns '+92...' or null when invalid.
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const r = normalizePhoneToE164(String(input));
  return r.valid ? r.e164 : null;
}
