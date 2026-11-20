/**
 * Brand font choices. The default pairs Plus Jakarta Sans headings with DM
 * Sans body text; any other choice is used for both. Variables come from
 * next/font in app/layout.tsx.
 */
export const BRAND_FONTS = ['Plus Jakarta Sans', 'Inter', 'DM Sans', 'Manrope', 'Poppins', 'Nunito Sans', 'IBM Plex Sans', 'Outfit', 'System'] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

const VARS: Record<string, string> = {
  Inter: 'var(--font-inter)',
  Manrope: 'var(--font-manrope)',
  Poppins: 'var(--font-poppins)',
  'Nunito Sans': 'var(--font-nunito)',
  'IBM Plex Sans': 'var(--font-plex)',
  Outfit: 'var(--font-outfit)',
  System: 'system-ui',
};

/** CSS custom properties for a font choice (empty object = defaults). */
export function fontVars(font: string | null | undefined): Record<string, string> {
  if (!font || font === 'Plus Jakarta Sans') return {};
  if (font === 'DM Sans') return { '--font-display': 'var(--font-body)' };
  const v = VARS[font];
  return v ? { '--font-display': v, '--font-body': v } : {};
}

export function applyFont(font: string | null | undefined, el: HTMLElement = document.documentElement) {
  el.style.removeProperty('--font-display');
  el.style.removeProperty('--font-body');
  for (const [k, v] of Object.entries(fontVars(font))) el.style.setProperty(k, v);
}
