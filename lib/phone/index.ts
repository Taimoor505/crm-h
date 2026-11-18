/**
 * Phone numbers for any country (brief §3). The API gets E.164; people see
 * national format for their own country and international otherwise.
 */
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

export type ParseResult =
  | { ok: true; e164: string; country: CountryCode | undefined }
  | { ok: false; error: 'empty' | 'invalid' | 'too_short' | 'too_long' };

export function isCountryCode(c: string | null | undefined): c is CountryCode {
  return !!c && (getCountries() as string[]).includes(c.toUpperCase());
}

export function parsePhone(input: string, country?: string | null): ParseResult {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, error: 'empty' };
  const def = isCountryCode(country) ? (country.toUpperCase() as CountryCode) : undefined;
  // Accept "00" international prefixes.
  const normalised = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  const p = parsePhoneNumberFromString(normalised, def);
  if (!p) return { ok: false, error: 'invalid' };
  if (!p.isPossible()) {
    const digits = p.nationalNumber.length;
    return { ok: false, error: digits < 6 ? 'too_short' : digits > 14 ? 'too_long' : 'invalid' };
  }
  return { ok: true, e164: p.number, country: p.country };
}

/** "national" for the workspace's own country, "international" for everything else. */
export function formatPhone(e164: string | null | undefined, style: 'national' | 'international' | 'auto' = 'auto', homeCountry?: string): string {
  if (!e164) return '';
  const p = parsePhoneNumberFromString(e164);
  if (!p) return e164;
  if (style === 'auto') {
    const home = homeCountry?.toUpperCase();
    // Reserved/test ranges have no country; fall back to the calling code.
    const atHome = !!home && (p.country === home || (!p.country && isCountryCode(home) && p.countryCallingCode === getCountryCallingCode(home as CountryCode)));
    return atHome ? p.formatNational() : p.formatInternational();
  }
  return style === 'national' ? p.formatNational() : p.formatInternational();
}

/** Digits only, for wa.me links. */
export function waDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}

export function waLink(e164: string, text?: string): string {
  return `https://wa.me/${waDigits(e164)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(e164: string): string {
  return `tel:${e164}`;
}

export function callingCode(country: string): string {
  try {
    return `+${getCountryCallingCode(country.toUpperCase() as CountryCode)}`;
  } catch {
    return '';
  }
}

export function formatAsYouType(input: string, country?: string): string {
  return new AsYouType(isCountryCode(country) ? (country.toUpperCase() as CountryCode) : undefined).input(input);
}

export interface CountryOption {
  code: CountryCode;
  name: string;
  dial: string;
  flag: string;
}

function flagOf(code: string) {
  return String.fromCodePoint(...code.split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let cached: CountryOption[] | null = null;
/** All countries with localized names, sorted by name. */
export function countryOptions(locale = 'en'): CountryOption[] {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  cached = getCountries()
    .map((code) => ({ code, name: names?.of(code) ?? code, dial: `+${getCountryCallingCode(code)}`, flag: flagOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
