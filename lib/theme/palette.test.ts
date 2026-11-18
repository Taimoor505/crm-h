import { describe, expect, it } from 'vitest';
import { contrastRatio, generatePalette, onColor } from './palette';

const COLORS = ['#059669', '#facc15', '#0b1d3a', '#e11d48', '#ffffff', '#7c3aed'];

describe('generatePalette', () => {
  it.each(COLORS)('keeps text legible on %s', (primary) => {
    const p = generatePalette(primary);
    // The better of black/white always reaches ~4.58:1 on any color.
    expect(contrastRatio(p['--brand-on-primary'], p['--brand-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p['--brand-ink'], p['--brand-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(p['--brand-primary-hover']).not.toBe(p['--brand-primary']);
  });

  it('uses black text on yellow and white text on very dark navy', () => {
    expect(onColor('#facc15')).toBe('#000000');
    expect(onColor('#0b1d3a')).toBe('#ffffff');
  });

  it('lightens very dark colors for hover instead of darkening to black', () => {
    const p = generatePalette('#0b1d3a');
    expect(p['--brand-primary-hover']).not.toBe('#000000');
  });

  it('falls back to the default color on invalid input', () => {
    expect(generatePalette('nope')['--brand-primary']).toBe('#059669');
  });

  it('uses the primary as accent when none is given', () => {
    const p = generatePalette('#1d4ed8');
    expect(p['--brand-accent']).toBe('#1d4ed8');
    expect(generatePalette('#1d4ed8', '#f59e0b')['--brand-on-accent']).toBe('#000000');
  });
});
