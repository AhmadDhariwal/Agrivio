import { describe, expect, it } from 'vitest';
import { allocateStock, isExpiredOnBusinessDate } from './allocation.js';

describe('inventory allocation FEFO/FIFO', () => {
  it('FEFO chooses earliest expiry then oldest received', () => {
    const result = allocateStock({
      trackingMode: 'batch_expiry',
      requestedQuantityMinorUnits: 1500000n,
      businessDate: '2026-08-11',
      excludeExpired: true,
      candidates: [
        {
          batchId: 'b2',
          batchNumber: 'LOT-2',
          expiryDate: '2027-06-01',
          firstReceivedAt: new Date('2026-02-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
        {
          batchId: 'b1',
          batchNumber: 'LOT-1',
          expiryDate: '2027-03-01',
          firstReceivedAt: new Date('2026-03-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].batchId).toBe('b1');
    expect(result.allocations[0].quantityBaseMinorUnits).toBe('1000000');
    expect(result.allocations[1].batchId).toBe('b2');
    expect(result.allocations[1].quantityBaseMinorUnits).toBe('500000');
  });

  it('FIFO chooses oldest received stock for non-expiry products', () => {
    const result = allocateStock({
      trackingMode: 'batch',
      requestedQuantityMinorUnits: 1200000n,
      businessDate: '2026-08-11',
      excludeExpired: true,
      candidates: [
        {
          batchId: 'new',
          batchNumber: 'NEW',
          expiryDate: null,
          firstReceivedAt: new Date('2026-05-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
        {
          batchId: 'old',
          batchNumber: 'OLD',
          expiryDate: null,
          firstReceivedAt: new Date('2026-01-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.allocations[0].batchId).toBe('old');
    expect(result.allocations[1].batchId).toBe('new');
  });

  it('returns insufficient stock when quantity cannot be fully allocated', () => {
    const result = allocateStock({
      trackingMode: 'none',
      requestedQuantityMinorUnits: 2000000n,
      businessDate: '2026-08-11',
      excludeExpired: true,
      candidates: [
        {
          batchId: null,
          expiryDate: null,
          firstReceivedAt: new Date('2026-01-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_STOCK');
  });

  it('excludes expired batches from normal allocation', () => {
    expect(isExpiredOnBusinessDate('2026-08-10', '2026-08-11')).toBe(true);
    const result = allocateStock({
      trackingMode: 'batch_expiry',
      requestedQuantityMinorUnits: 1000000n,
      businessDate: '2026-08-11',
      excludeExpired: true,
      candidates: [
        {
          batchId: 'expired',
          expiryDate: '2026-08-10',
          firstReceivedAt: new Date('2026-01-01T00:00:00.000Z'),
          quantityBaseMinorUnits: '1000000',
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
