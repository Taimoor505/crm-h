import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * E.164 normalisation for any country. `defaultCountry` (the workspace's
 * default_phone_country) is used for numbers typed without a + prefix.
 * Accepts "+44 20 7946 0958", "00971 50 123 4567" and local forms like
 * "0300 1234567" (with defaultCountry PK). Returns null when invalid.
 */
export function normalizePhone(input: unknown, defaultCountry = 'PK'): string | null {
  if (input === null || input === undefined) return null;
  let raw = String(input).trim();
  if (!raw) return null;
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;
  const country = (/^[A-Za-z]{2}$/.test(defaultCountry) ? defaultCountry.toUpperCase() : 'PK') as CountryCode;
  const p = parsePhoneNumberFromString(raw, country);
  if (!p || !p.isValid()) return null;
  return p.number;
}
