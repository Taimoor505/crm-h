import { generatePalette } from '@/lib/theme/palette';

export interface ServerBrand {
  appName: string;
  shortName: string;
  logoText: string;
  primary: string;
  onPrimary: string;
  logoUrl: string | null;
}

/**
 * Branding for server-rendered assets (manifest, icons), resolved by hostname
 * through the public /api/v1/branding endpoint so partner domains get their own.
 */
export async function brandForRequest(req: Request): Promise<ServerBrand> {
  const url = new URL(req.url);
  let b: Record<string, string | undefined> = {};
  try {
    const res = await fetch(`${url.origin}/api/v1/branding?host=${encodeURIComponent(url.hostname)}`, { cache: 'no-store' });
    if (res.ok) b = ((await res.json()) as { branding?: Record<string, string> }).branding ?? {};
  } catch {
    // Fall back to neutral defaults.
  }
  const palette = generatePalette(b.primaryColor);
  const appName = b.appName || 'CRM';
  return {
    appName,
    shortName: appName.length > 12 ? (b.logoText || appName.slice(0, 12)) : appName,
    logoText: (b.logoText || appName.slice(0, 2)).slice(0, 2).toUpperCase(),
    primary: palette['--brand-primary'],
    onPrimary: palette['--brand-on-primary'],
    logoUrl: b.logoUrl || null,
  };
}
