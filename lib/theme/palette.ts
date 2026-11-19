/**
 * Builds the seven --brand-* CSS variables from a partner's primary (and
 * optional accent) color, so any partner color stays legible (WCAG 4.5:1).
 */

export interface BrandPalette {
  '--brand-primary': string;
  '--brand-primary-hover': string;
  '--brand-surface': string;
  '--brand-ink': string;
  '--brand-on-primary': string;
  '--brand-accent': string;
  '--brand-on-accent': string;
}

type Rgb = [number, number, number];

const BLACK = '#000000';
const WHITE = '#ffffff';
export const DEFAULT_PRIMARY = '#059669';

export function parseHex(input: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a) ?? [0, 0, 0]);
  const lb = relativeLuminance(parseHex(b) ?? [0, 0, 0]);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever has more contrast on the given background. */
export function onColor(bg: string): string {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Darken (or lighten very dark colors) for hover/pressed states. */
function hoverOf(rgb: Rgb): Rgb {
  return relativeLuminance(rgb) < 0.03 ? mix(rgb, [255, 255, 255], 0.18) : mix(rgb, [0, 0, 0], 0.15);
}

/** Darkest mix of the primary that still passes 4.5:1 on the surface tint. */
function inkOf(rgb: Rgb, surface: string): Rgb {
  for (let t = 0.2; t <= 0.95; t += 0.05) {
    const candidate = mix(rgb, [0, 0, 0], t);
    if (contrastRatio(toHex(candidate), surface) >= 4.5) return candidate;
  }
  return [17, 24, 39];
}

export function generatePalette(primary?: string | null, accent?: string | null): BrandPalette {
  const p = parseHex(primary ?? '') ?? parseHex(DEFAULT_PRIMARY)!;
  const a = parseHex(accent ?? '') ?? p;
  const primaryHex = toHex(p);
  const accentHex = toHex(a);
  const surface = toHex(mix(p, [255, 255, 255], 0.9));
  return {
    '--brand-primary': primaryHex,
    '--brand-primary-hover': toHex(hoverOf(p)),
    '--brand-surface': surface,
    '--brand-ink': toHex(inkOf(p, surface)),
    '--brand-on-primary': onColor(primaryHex),
    '--brand-accent': accentHex,
    '--brand-on-accent': onColor(accentHex),
  };
}

export function applyPalette(palette: BrandPalette, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(palette)) el.style.setProperty(k, v);
}
