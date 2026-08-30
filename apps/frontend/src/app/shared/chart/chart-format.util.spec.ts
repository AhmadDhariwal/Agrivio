import { formatPkrAmount, parseAmount } from './chart-format.util';

describe('chart-format.util', () => {
  it('formats PKR amounts and preserves unavailable values', () => {
    expect(formatPkrAmount('1234.5')).toMatch(/1,234\.50/);
    expect(formatPkrAmount('0')).toContain('0.00');
    expect(formatPkrAmount(null)).toBe('Unavailable');
  });

  it('parses numeric strings for chart scaling', () => {
    expect(parseAmount('42.5')).toBe(42.5);
    expect(Number.isNaN(parseAmount(''))).toBe(true);
  });
});
