import { describe, expect, it } from 'vitest';
import { classifyExpiry, daysBetweenDateOnly } from './expiry.js';

describe('inventory expiry classification', () => {
  it('classifies expired, upcoming, and normal stock', () => {
    expect(
      classifyExpiry({
        expiryDate: '2026-08-10',
        businessDate: '2026-08-11',
        thresholdDays: 30,
      }),
    ).toBe('expired');

    expect(
      classifyExpiry({
        expiryDate: '2026-08-20',
        businessDate: '2026-08-11',
        thresholdDays: 30,
      }),
    ).toBe('upcoming');

    expect(
      classifyExpiry({
        expiryDate: '2027-01-01',
        businessDate: '2026-08-11',
        thresholdDays: 30,
      }),
    ).toBe('normal');
  });

  it('computes day differences using date-only values', () => {
    expect(daysBetweenDateOnly('2026-08-11', '2026-08-20')).toBe(9);
  });
});
