import { describe, expect, it } from 'vitest';

const { allocateGeneralCustomerPayment } = require('./customer-allocation');

describe('BR-PAYMENT-004 general customer allocation', () => {
  it('allocates oldest unpaid invoice first then due-date/invoice-date/sequence', () => {
    const result = allocateGeneralCustomerPayment(
      [
        {
          id: 's-new',
          outstandingMinorUnits: '50000',
          dueDate: '2026-08-20',
          invoiceDate: '2026-08-10',
          sequence: '2',
        },
        {
          id: 's-old',
          outstandingMinorUnits: '30000',
          dueDate: '2026-08-01',
          invoiceDate: '2026-07-01',
          sequence: '1',
        },
        {
          id: 's-mid',
          outstandingMinorUnits: '20000',
          dueDate: '2026-08-01',
          invoiceDate: '2026-07-15',
          sequence: '3',
        },
      ],
      '70000',
    );

    expect(result.allocations).toEqual([
      { saleId: 's-old', allocatedAmountMinorUnits: '30000' },
      { saleId: 's-mid', allocatedAmountMinorUnits: '20000' },
      { saleId: 's-new', allocatedAmountMinorUnits: '20000' },
    ]);
    expect(result.advanceAmountMinorUnits).toBe('0');
  });

  it('creates advance for unallocated remainder when no unpaid sales', () => {
    const result = allocateGeneralCustomerPayment([], '125050');
    expect(result.allocations).toEqual([]);
    expect(result.advanceAmountMinorUnits).toBe('125050');
  });

  it('uses invoice sequence when dates are equal', () => {
    const result = allocateGeneralCustomerPayment(
      [
        {
          id: 'b',
          outstandingMinorUnits: '10000',
          dueDate: null,
          invoiceDate: '2026-08-01',
          sequence: '2',
        },
        {
          id: 'a',
          outstandingMinorUnits: '10000',
          dueDate: null,
          invoiceDate: '2026-08-01',
          sequence: '1',
        },
      ],
      '15000',
    );
    expect(result.allocations[0].saleId).toBe('a');
    expect(result.allocations[0].allocatedAmountMinorUnits).toBe('10000');
    expect(result.allocations[1].saleId).toBe('b');
    expect(result.allocations[1].allocatedAmountMinorUnits).toBe('5000');
    expect(result.advanceAmountMinorUnits).toBe('0');
  });
});
