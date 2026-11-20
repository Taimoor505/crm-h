/**
 * The last brand this device saw (logo, name, colours), so the loading
 * screen can show it before the API answers. Per-device convenience only.
 */
export interface BrandCache {
  appName: string;
  logoText: string;
  logoUrl: string | null;
  palette: Record<string, string>;
}

const KEY = 'crm.brand.v1';

export function saveBrandCache(b: BrandCache) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // private mode: no cache
  }
}

export function readBrandCache(): BrandCache | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BrandCache) : null;
  } catch {
    return null;
  }
}
