// CORE STUB (Taimoor owns phone normalisation). Replace with his module; the
// signature normalizePhone(input) => '+92...' | null is all lead capture needs.

/**
 * Normalises a phone number to E.164. Pakistani formats people actually type:
 *   0300-1234567, 03001234567, 3001234567, 923001234567, +92 300 1234567, 0092...
 * International numbers are accepted when they start with + or 00.
 * Returns null when the input can't be a phone number.
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) return validE164(digits);
  if (digits.startsWith('00')) return validE164(digits.slice(2));
  if (digits.startsWith('92') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('3')) return `+92${digits}`;
  // Anything else (e.g. a landline typed without its leading zero) is ambiguous.
  return null;
}

function validE164(digits: string): string | null {
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return `+${digits}`;
}
