/** Workspace region settings (brief section 3). */
export interface RegionSettings {
  country: string;
  locale: string;
  currency: string;
  timezone: string;
  date_format: string;
  time_format: '12h' | '24h';
  week_starts_on: 0 | 1 | 6;
  area_unit: 'sqft' | 'sqm';
  default_phone_country: string;
}

interface CountryDefaults {
  locale: string;
  currency: string;
  timezone: string;
  area_unit: 'sqft' | 'sqm';
  time_format: '12h' | '24h';
  week_starts_on: 0 | 1 | 6;
}

/**
 * Pre-fill values for onboarding and the region fallback. Covers the launch
 * markets; anything else falls back to en-US style formatting with UTC.
 */
export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  US: { locale: 'en-US', currency: 'USD', timezone: 'America/New_York', area_unit: 'sqft', time_format: '12h', week_starts_on: 0 },
  CA: { locale: 'en-CA', currency: 'CAD', timezone: 'America/Toronto', area_unit: 'sqft', time_format: '12h', week_starts_on: 0 },
  GB: { locale: 'en-GB', currency: 'GBP', timezone: 'Europe/London', area_unit: 'sqm', time_format: '24h', week_starts_on: 1 },
  IE: { locale: 'en-IE', currency: 'EUR', timezone: 'Europe/Dublin', area_unit: 'sqm', time_format: '24h', week_starts_on: 1 },
  AE: { locale: 'en-AE', currency: 'AED', timezone: 'Asia/Dubai', area_unit: 'sqft', time_format: '12h', week_starts_on: 1 },
  SA: { locale: 'en-SA', currency: 'SAR', timezone: 'Asia/Riyadh', area_unit: 'sqm', time_format: '12h', week_starts_on: 0 },
  QA: { locale: 'en-QA', currency: 'QAR', timezone: 'Asia/Qatar', area_unit: 'sqm', time_format: '12h', week_starts_on: 6 },
  PK: { locale: 'en-PK', currency: 'PKR', timezone: 'Asia/Karachi', area_unit: 'sqft', time_format: '12h', week_starts_on: 1 },
  IN: { locale: 'en-IN', currency: 'INR', timezone: 'Asia/Kolkata', area_unit: 'sqft', time_format: '12h', week_starts_on: 0 },
  BD: { locale: 'en-BD', currency: 'BDT', timezone: 'Asia/Dhaka', area_unit: 'sqft', time_format: '12h', week_starts_on: 6 },
  AU: { locale: 'en-AU', currency: 'AUD', timezone: 'Australia/Sydney', area_unit: 'sqm', time_format: '12h', week_starts_on: 1 },
  NZ: { locale: 'en-NZ', currency: 'NZD', timezone: 'Pacific/Auckland', area_unit: 'sqm', time_format: '12h', week_starts_on: 1 },
  SG: { locale: 'en-SG', currency: 'SGD', timezone: 'Asia/Singapore', area_unit: 'sqft', time_format: '12h', week_starts_on: 1 },
  MY: { locale: 'en-MY', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur', area_unit: 'sqft', time_format: '12h', week_starts_on: 1 },
  ZA: { locale: 'en-ZA', currency: 'ZAR', timezone: 'Africa/Johannesburg', area_unit: 'sqm', time_format: '24h', week_starts_on: 1 },
  NG: { locale: 'en-NG', currency: 'NGN', timezone: 'Africa/Lagos', area_unit: 'sqm', time_format: '12h', week_starts_on: 1 },
  KE: { locale: 'en-KE', currency: 'KES', timezone: 'Africa/Nairobi', area_unit: 'sqm', time_format: '12h', week_starts_on: 1 },
  DE: { locale: 'en-DE', currency: 'EUR', timezone: 'Europe/Berlin', area_unit: 'sqm', time_format: '24h', week_starts_on: 1 },
};

export function regionFromCountry(country: string, overrides: Partial<RegionSettings> = {}): RegionSettings {
  const c = country.toUpperCase();
  const d = COUNTRY_DEFAULTS[c] ?? { locale: 'en-US', currency: 'USD', timezone: 'UTC', area_unit: 'sqm', time_format: '24h', week_starts_on: 1 };
  return {
    country: c,
    locale: d.locale,
    currency: d.currency,
    timezone: d.timezone,
    date_format: 'dd MMM yyyy',
    time_format: d.time_format,
    week_starts_on: d.week_starts_on,
    area_unit: d.area_unit,
    default_phone_country: c,
    ...overrides,
  };
}

/** Timezone of the device, for picker defaults. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function supportedTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'PKR', 'INR', 'BDT', 'CAD', 'AUD', 'NZD', 'SGD', 'MYR', 'ZAR', 'NGN', 'KES'];
