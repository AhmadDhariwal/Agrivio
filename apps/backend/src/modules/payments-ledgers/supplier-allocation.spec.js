import { describe, expect, it } from 'vitest';

const { allocateGeneralSupplierPayment } = require('./supplier-allocation');

describe('BR-PAYMENT-008 general supplier allocation', () => {
  it('allocates oldest unpaid purchase first then due-date/purchase-date/sequence', () => {
    const result = allocateGeneralSupplierPayment(
      [
        {
          id: 'p-new',
          outstandingMinorUnits: '50000',
          dueDate: '2026-08-20',
          purchaseDate: '2026-08-10',
          sequence: '2',
        },
        {
          id: 'p-old',
          outstandingMinorUnits: '30000',
          dueDate: '2026-08-01',
          purchaseDate: '2026-07-01',
          sequence: '1',
        },
        {
          id: 'p-mid',
          outstandingMinorUnits: '20000',
          dueDate: '2026-08-01',
          purchaseDate: '2026-07-15',
          sequence: '3',
        },
      ],
      '70000',
    );

    expect(result.allocations).toEqual([
      { purchaseId: 'p-old', allocatedAmountMinorUnits: '30000' },
      { purchaseId: 'p-mid', allocatedAmountMinorUnits: '20000' },
      { purchaseId: 'p-new', allocatedAmountMinorUnits: '20000' },
    ]);
    expect(result.advanceAmountMinorUnits).toBe('0');
  });

  it('creates advance for unallocated remainder when no unpaid purchases', () => {
    const result = allocateGeneralSupplierPayment([], '125050');
    expect(result.allocations).toEqual([]);
    expect(result.advanceAmountMinorUnits).toBe('125050');
  });

  it('uses purchase sequence when dates are equal', () => {
    const result = allocateGeneralSupplierPayment(
      [
        {
          id: 'b',
          outstandingMinorUnits: '10000',
          dueDate: null,
          purchaseDate: '2026-08-01',
          sequence: '2',
        },
        {
          id: 'a',
          outstandingMinorUnits: '10000',
          dueDate: null,
          purchaseDate: '2026-08-01',
          sequence: '1',
        },
      ],
      '15000',
    );
    expect(result.allocations[0].purchaseId).toBe('a');
    expect(result.allocations[0].allocatedAmountMinorUnits).toBe('10000');
    expect(result.allocations[1].purchaseId).toBe('b');
    expect(result.allocations[1].allocatedAmountMinorUnits).toBe('5000');
    expect(result.advanceAmountMinorUnits).toBe('0');
  });
});
