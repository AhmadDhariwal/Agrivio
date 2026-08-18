import { describe, expect, it } from 'vitest';
import { createInMemoryInventoryStore } from './inventory.store.js';

describe('inventory pagination', () => {
  it('returns an exact total and a partial last page for more than 238 balances', async () => {
    const store = createInMemoryInventoryStore();
    for (let index = 0; index < 238; index += 1) {
      await store.insertBalance(null, {
        organizationId: 'org-1',
        warehouseId: 'warehouse-1',
        productId: `product-${index}`,
        batchId: null,
        quantityBaseMinorUnits: String(index),
      });
    }

    const result = await store.listBalancesPage(
      'org-1',
      { warehouseIds: ['warehouse-1'] },
      { skip: 225, pageSize: 25 },
    );

    expect(result.total).toBe(238);
    expect(result.items).toHaveLength(13);
    expect(new Set(result.items.map((item) => item.productId)).size).toBe(13);
  });

  it('applies warehouse scope before counting and slicing', async () => {
    const store = createInMemoryInventoryStore();
    for (let index = 0; index < 30; index += 1) {
      await store.insertBalance(null, {
        organizationId: 'org-1',
        warehouseId: index < 12 ? 'allowed' : 'forbidden',
        productId: `product-${index}`,
        batchId: null,
      });
    }

    const result = await store.listBalancesPage(
      'org-1',
      { warehouseIds: ['allowed'] },
      { skip: 0, pageSize: 10 },
    );

    expect(result.total).toBe(12);
    expect(result.items).toHaveLength(10);
    expect(result.items.every((item) => item.warehouseId === 'allowed')).toBe(true);
  });
});
