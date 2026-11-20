'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBranding } from '@/lib/api/endpoints/auth';
import { adaptBrandingConfig } from '@/lib/api/adapters';
import type { Branding } from '@/lib/api/types';
import { qk } from '@/hooks/queries/keys';
import { applyPalette, generatePalette, sidebarPalette } from './palette';
import { applyFont } from './fonts';

interface BrandingValue {
  branding: Branding;
  partner: { id: string; name: string; is_house: boolean } | null;
  loading: boolean;
}

const DEFAULT = adaptBrandingConfig({});
const Ctx = createContext<BrandingValue>({ branding: DEFAULT, partner: null, loading: true });

function currentHost(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? undefined : h;
}

/** A small SVG favicon with the brand initials, when the partner has no favicon. */
function initialsFavicon(text: string, bg: string, fg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="${fg}" text-anchor="middle">${text.slice(0, 2).replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Loads branding (by workspace, or by hostname for partner domains), merges
 * workspace overrides, and writes the --brand-* variables on <html>. Uses the
 * variable names the workbench shell already sets.
 */
export function BrandingProvider({
  workspaceId,
  overrides,
  preview,
  children,
}: {
  workspaceId: string | null;
  overrides?: Partial<Branding>;
  /** Live preview (branding editor, /dev/tokens): wins over everything. */
  preview?: Partial<Branding> | null;
  children: React.ReactNode;
}) {
  const host = currentHost();
  const q = useQuery({
    queryKey: qk.branding(workspaceId, host),
    queryFn: () => getBranding({ workspaceId, host }),
    staleTime: 10 * 60_000,
  });

  const branding = useMemo<Branding>(() => {
    const base = q.data?.branding ?? DEFAULT;
    const merged = { ...base, ...stripEmpty(overrides), ...stripEmpty(preview ?? undefined) };
    return { ...merged, hideModules: merged.hideModules ?? [] };
  }, [q.data, overrides, preview]);

  useEffect(() => {
    const palette = generatePalette(branding.primaryColor, branding.accentColor);
    applyPalette(palette);
    for (const [k, v] of Object.entries(sidebarPalette(branding.sidebarColor))) document.documentElement.style.setProperty(k, v);
    applyFont(branding.font);
    document.title = branding.appName;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.dataset.brand = 'true';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl || initialsFavicon(branding.logoText, palette['--brand-primary'], palette['--brand-on-primary']);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = palette['--brand-primary'];
  }, [branding]);

  const value = useMemo<BrandingValue>(
    () => ({ branding, partner: q.data?.partner ?? null, loading: q.isLoading }),
    [branding, q.data, q.isLoading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function stripEmpty<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}

export function useBranding() {
  return useContext(Ctx);
}
