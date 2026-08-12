import { describe, expect, it } from 'vitest';

const { formatInvoiceNumber } = require('./invoice-sequence');

describe('branch invoice numbering format', () => {
  it('formats prefix and six-digit sequence', () => {
    expect(formatInvoiceNumber('LHR', 1)).toBe('LHR-000001');
    expect(formatInvoiceNumber('MAIN', 42)).toBe('MAIN-000042');
  });
});
