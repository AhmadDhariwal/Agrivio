import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachProductListSummaries, buildProductListSummary } from '../catalog/catalog-list-summary.js';
import {
  toMovementListItemDto,
  attachFindingBatchSnapshots,
  attachBatchStockLocations,
} from './inventory-reference-read.js';

describe('catalog-list-summary', () => {
  it('composes retail selling price and available quantity per product', async () => {
    const store = {
      listActivePricesByProductIds: vi.fn(async () => [
        {
          productId: 'p1',
          status: 'active',
          priceTier: 'retail',
          amountMinorUnits: '25000',
          currency: 'PKR',
        },
      ]),
    };
    const inventoryReader = {
      sumAvailableQuantityByProductIds: vi.fn(async () => new Map([['p1', '50000']])),
    };

    const items = await attachProductListSummaries(store, inventoryReader, 'org-1', [
      { id: 'p1', name: 'Wheat Seed' },
    ]);

    expect(items[0].listSummary).toEqual({
      sellingPrice: { amount: '250.00', currency: 'PKR' },
      availableQuantityBase: '5.0000',
    });
  });

  it('buildProductListSummary prefers retail tier', () => {
    const summary = buildProductListSummary(
      [
        { status: 'active', priceTier: 'wholesale', amountMinorUnits: '10000', currency: 'PKR' },
        { status: 'active', priceTier: 'retail', amountMinorUnits: '15000', currency: 'PKR' },
      ],
      '20000',
    );

    expect(summary.sellingPrice).toEqual({ amount: '150.00', currency: 'PKR' });
    expect(summary.availableQuantityBase).toBe('2.0000');
  });
});

describe('inventory-reference-read', () => {
  let store;

  beforeEach(() => {
    store = {
      findBatchesByIds: vi.fn(async () => [{ _id: 'b1', batchNumber: 'LOT-001' }]),
      listBalanceLocationsByBatchIds: vi.fn(async () =>
        new Map([
          [
            'b1',
            [
              {
                warehouseId: 'w1',
                quantityBaseMinorUnits: '10000',
                unsellableQuantityBaseMinorUnits: '0',
              },
            ],
          ],
        ]),
      ),
    };
  });

  it('adds movement display snapshots from reference maps', () => {
    const dto = toMovementListItemDto(
      {
        _id: 'm1',
        organizationId: 'org-1',
        warehouseId: 'w1',
        productId: 'p1',
        batchId: 'b1',
        direction: 'inbound',
        quantityBaseMinorUnits: '10000',
        enteredQuantityMinorUnits: '10000',
        unitCode: 'kg',
        conversionFactorSnapshot: '1',
        packagingUnitId: null,
        inventoryValueMinorUnits: '0',
        unitCostMinorUnits: '0',
        sourceType: 'opening_stock',
        sourceId: 's1',
        status: 'posted',
        postedAt: '2026-01-01T00:00:00.000Z',
        postedBy: 'u1',
      },
      {
        productMap: new Map([
          ['p1', { id: 'p1', name: 'Fertilizer', sku: 'F-1', baseUnitCode: 'kg' }],
        ]),
        warehouseMap: new Map([['w1', { id: 'w1', name: 'Main WH', code: 'WH1' }]]),
        batchMap: new Map([['b1', { _id: 'b1', batchNumber: 'LOT-001' }]]),
      },
    );

    expect(dto.productNameSnapshot).toBe('Fertilizer');
    expect(dto.warehouseNameSnapshot).toBe('Main WH');
    expect(dto.batchNumberSnapshot).toBe('LOT-001');
  });

  it('adds batch stock locations for visible batch rows', async () => {
    const enriched = await attachBatchStockLocations(store, 'org-1', [
      { id: 'b1', batchNumber: 'LOT-001' },
    ]);

    expect(enriched[0].stockLocations).toEqual([
      { warehouseId: 'w1', quantityBase: '1.0000', unsellableQuantityBase: '0.0000' },
    ]);
  });

  it('adds batchNumberSnapshot to reconciliation findings', async () => {
    const findings = await attachFindingBatchSnapshots(store, 'org-1', [
      { code: 'MOVEMENT_WITHOUT_BALANCE', batchId: 'b1' },
    ]);

    expect(findings[0].batchNumberSnapshot).toBe('LOT-001');
  });
});
