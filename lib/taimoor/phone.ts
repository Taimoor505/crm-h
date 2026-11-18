export interface PhoneNormalizationResult {
  valid: boolean;
  e164: string | null;
  nationalFormat: string | null;
  carrierType: 'mobile' | 'landline' | 'international' | null;
  error?: string;
}

/**
 * Normalizes Pakistani & international numbers into strict E.164 format.
 * Examples:
 * - "0300-1234567" -> "+923001234567"
 * - "3001234567" -> "+923001234567"
 * - "+92 300 1234567" -> "+923001234567"
 * - "00923001234567" -> "+923001234567"
 * - "042-35761234" -> "+924235761234"
 */
export function normalizePhoneToE164(rawInput: string | null | undefined): PhoneNormalizationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      valid: false,
      e164: null,
      nationalFormat: null,
      carrierType: null,
      error: 'Phone number is required',
    };
  }

  const trimmed = rawInput.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return {
      valid: false,
      e164: null,
      nationalFormat: null,
      carrierType: null,
      error: 'Phone number contains no digits',
    };
  }

  let candidate = digitsOnly;

  // Handle 0092... international dialing prefix
  if (!hasPlus && candidate.startsWith('0092')) {
    candidate = candidate.slice(2); // becomes 92...
  } else if (!hasPlus && candidate.startsWith('00')) {
    // Generic international 00 prefix
    const intl = `+${candidate.slice(2)}`;
    if (intl.length >= 8 && intl.length <= 16) {
      return {
        valid: true,
        e164: intl,
        nationalFormat: intl,
        carrierType: 'international',
      };
    }
  }

  // Pakistani 10-digit mobile without leading 0 or 92 (e.g., 3001234567)
  if (!hasPlus && /^3\d{9}$/.test(candidate)) {
    const e164 = `+92${candidate}`;
    return {
      valid: true,
      e164,
      nationalFormat: `0${candidate.slice(0, 3)}-${candidate.slice(3)}`,
      carrierType: 'mobile',
    };
  }

  // Pakistani 11-digit mobile with leading 0 (e.g., 03001234567)
  if (!hasPlus && /^03\d{9}$/.test(candidate)) {
    const e164 = `+92${candidate.slice(1)}`;
    return {
      valid: true,
      e164,
      nationalFormat: `${candidate.slice(0, 4)}-${candidate.slice(4)}`,
      carrierType: 'mobile',
    };
  }

  // Pakistani mobile with 92 country code (e.g., 923001234567)
  if (/^923\d{9}$/.test(candidate)) {
    const e164 = `+${candidate}`;
    const local = candidate.slice(2);
    return {
      valid: true,
      e164,
      nationalFormat: `0${local.slice(0, 3)}-${local.slice(3)}`,
      carrierType: 'mobile',
    };
  }

  // Pakistani landline with leading 0 (e.g., 04235761234, 02135831234, 0512223344)
  if (!hasPlus && /^0(2\d|4\d|5\d|6\d|7\d|8\d|9\d)\d{6,8}$/.test(candidate)) {
    const e164 = `+92${candidate.slice(1)}`;
    return {
      valid: true,
      e164,
      nationalFormat: `${candidate.slice(0, 3)}-${candidate.slice(3)}`,
      carrierType: 'landline',
    };
  }

  // Pakistani landline with 92 prefix
  if (/^92[2456789]\d{7,9}$/.test(candidate)) {
    const e164 = `+${candidate}`;
    return {
      valid: true,
      e164,
      nationalFormat: `0${candidate.slice(2, 4)}-${candidate.slice(4)}`,
      carrierType: 'landline',
    };
  }

  // Generic valid E.164 international number when explicitly prefixed with +
  if (hasPlus && candidate.length >= 8 && candidate.length <= 15) {
    if (candidate.startsWith('92') && candidate.length !== 12 && candidate.length !== 11) {
      return {
        valid: false,
        e164: null,
        nationalFormat: null,
        carrierType: null,
        error: 'Invalid Pakistani (+92) phone length; expected +923XXXXXXXXX (12 digits)',
      };
    }
    return {
      valid: true,
      e164: `+${candidate}`,
      nationalFormat: `+${candidate}`,
      carrierType: candidate.startsWith('92') ? 'mobile' : 'international',
    };
  }

  return {
    valid: false,
    e164: null,
    nationalFormat: null,
    carrierType: null,
    error: 'Unrecognized phone format. Expected Pakistani mobile (03XX-XXXXXXX / +923XXXXXXXXX) or valid E.164.',
  };
}
