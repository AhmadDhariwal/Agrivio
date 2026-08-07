import { describe, expect, it } from 'vitest';
import {
  addMoneyMinorUnits,
  formatMoneyMinorUnits,
  isValidDateOnlyString,
  multiplyMoneyMinorUnits,
  parseDateOnly,
  parseMoneyMinorUnits,
  parseQuantityMinorUnits,
  parseUtcTimestamp,
} from './money-and-time';
describe('money primitives', () => {
  it('parses and formats PKR amounts using minor units', () => {
    const minor = parseMoneyMinorUnits('1250.50');
    expect(formatMoneyMinorUnits(minor)).toBe('1250.50');
    expect(formatMoneyMinorUnits(addMoneyMinorUnits(minor, parseMoneyMinorUnits('0.01')))).toBe(
      '1250.51',
    );
  });

  it('uses deterministic round-half-up for intermediate multiplication', () => {
    const value = parseMoneyMinorUnits('10.00');
    const result = multiplyMoneyMinorUnits(value, 1n, 3n);
    expect(formatMoneyMinorUnits(result)).toBe('3.33');
  });

  it('rejects invalid monetary strings', () => {
    expect(() => parseMoneyMinorUnits('12.345')).toThrow(/Invalid monetary value/);
  });
});

describe('quantity and time primitives', () => {
  it('parses quantities without float drift', () => {
    expect(parseQuantityMinorUnits('1.2345')).toBe(12345n);
  });

  it('validates date-only values without timezone shifting', () => {
    expect(isValidDateOnlyString('2026-02-29')).toBe(false);
    expect(parseDateOnly('2026-08-06')).toBe('2026-08-06');
  });

  it('requires UTC timestamps', () => {
    expect(() => parseUtcTimestamp('2026-08-06T12:00:00+05:00')).toThrow(/UTC/);
    expect(parseUtcTimestamp('2026-08-06T07:00:00.000Z').toISOString()).toBe(
      '2026-08-06T07:00:00.000Z',
    );
  });
});
