import { describe, expect, it } from 'vitest';
import {
  parseConversionFactor,
  assertCompatibleMeasurementDimension,
} from './conversion-factor.js';

describe('conversion factor primitives', () => {
  it('accepts positive factors up to six decimal places', () => {
    expect(parseConversionFactor('5')).toBe('5');
    expect(parseConversionFactor('5.000000')).toBe('5');
    expect(parseConversionFactor('1.250000')).toBe('1.25');
    expect(parseConversionFactor('0.000001')).toBe('0.000001');
  });

  it('rejects zero, negative, and excessive precision', () => {
    expect(() => parseConversionFactor('0')).toThrow(/greater than zero/);
    expect(() => parseConversionFactor('-1')).toThrow(/positive decimal/);
    expect(() => parseConversionFactor('1.1234567')).toThrow(/six places/);
  });

  it('rejects incompatible measurement dimensions', () => {
    expect(() => assertCompatibleMeasurementDimension('mass', 'volume')).toThrow(
      /measurement dimension/,
    );
  });
});
