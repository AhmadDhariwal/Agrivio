import { describe, expect, it } from 'vitest';

function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [n >> 16, (n >> 8) & 255, n & 255].map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [r, g, b] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe('NFR-A11Y-006 WCAG 2.2 AA contrast math', () => {
  it('requires 4.5:1 for body text tokens on white', () => {
    expect(contrastRatio('#14241b', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#55665c', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('requires 3:1 for control borders on white', () => {
    expect(contrastRatio('#74867c', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#2f7d55', '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
