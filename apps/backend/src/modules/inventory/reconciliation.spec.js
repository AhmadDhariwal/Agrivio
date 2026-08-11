import { describe, expect, it } from 'vitest';
import { reconcileInventoryState } from './reconciliation.js';

describe('inventory reconciliation', () => {
  it('reports ok when movements, balances, and cost states agree', () => {
    const result = reconcileInventoryState({
      movements: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          batchId: null,
          direction: 'inbound',
          quantityBaseMinorUnits: '20000',
          inventoryValueMinorUnits: '10000',
          status: 'posted',
        },
      ],
      balances: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          batchId: null,
          quantityBaseMinorUnits: '20000',
        },
      ],
      costStates: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantityBaseMinorUnits: '20000',
          inventoryValueMinorUnits: '10000',
          weightedAverageCostMinorUnits: '5000',
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('detects deliberately corrupted balance and valuation fixtures', () => {
    const result = reconcileInventoryState({
      movements: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          batchId: 'batch-1',
          direction: 'inbound',
          quantityBaseMinorUnits: '10000',
          inventoryValueMinorUnits: '5000',
          status: 'posted',
        },
      ],
      balances: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          batchId: 'batch-1',
          quantityBaseMinorUnits: '9999',
        },
      ],
      costStates: [
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantityBaseMinorUnits: '10000',
          inventoryValueMinorUnits: '1',
          weightedAverageCostMinorUnits: '5000',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((item) => item.code === 'MOVEMENT_BALANCE_QUANTITY_MISMATCH')).toBe(
      true,
    );
    expect(result.findings.some((item) => item.code === 'COST_STATE_QUANTITY_MISMATCH')).toBe(true);
    expect(result.findings.some((item) => item.code === 'COST_STATE_VALUATION_MISMATCH')).toBe(
      true,
    );
  });
});
