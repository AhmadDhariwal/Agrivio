import { describe, it, expect } from 'vitest';
import { getAppliedToLabel } from './customer-payments-presentation.util';

describe('getAppliedToLabel', () => {
  it('returns "Receivable" for receivable', () => {
    expect(getAppliedToLabel('receivable')).toBe('Receivable');
  });

  it('returns "Advance" for advance', () => {
    expect(getAppliedToLabel('advance')).toBe('Advance');
  });

  it('returns "Receivable & Advance" for receivable_and_advance', () => {
    expect(getAppliedToLabel('receivable_and_advance')).toBe('Receivable & Advance');
  });

  it('returns null for null', () => {
    expect(getAppliedToLabel(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getAppliedToLabel(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getAppliedToLabel('')).toBeNull();
  });

  it('returns null for unknown string', () => {
    expect(getAppliedToLabel('unknown_type')).toBeNull();
  });
});
