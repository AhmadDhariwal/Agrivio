import { describe, expect, it } from 'vitest';
import { createInventoryModule } from './inventory.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';

function ownerContext() {
  return {
    userId: 'owner-1',
    organizationId: 'org-1',
    permissions: permissionsForMembershipRole('Owner'),
  };
}

function managerContext() {
  return {
    userId: 'manager-1',
    organizationId: 'org-1',
    permissions: permissionsForMembershipRole('Manager'),
  };
}

describe('F04 P2 inventory allocation, expiry, negative stock, adjustments', () => {
  it('allocates FEFO/FIFO, blocks negative stock, supports override, posts and reverses adjustments', async () => {
    const fixedNow = new Date('2026-08-11T10:00:00.000Z');
    const module = createInventoryModule({
      persistence: 'memory',
      now: () => fixedNow,
      hasPermission: (authContext, permission) =>
        (authContext.permissions ?? []).includes(permission),
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      catalogService: {
        async getProduct(_organizationId, productId) {
          if (productId === 'prod-expiry') {
            return {
              id: 'prod-expiry',
              trackingMode: 'batch_expiry',
              baseUnitCode: 'KG',
              status: 'active',
            };
          }
          if (productId === 'prod-none') {
            return {
              id: 'prod-none',
              trackingMode: 'none',
              baseUnitCode: 'EA',
              status: 'active',
            };
          }
          return {
            id: productId,
            trackingMode: 'batch',
            baseUnitCode: 'KG',
            status: 'active',
          };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse() {
          return { id: 'wh-1', status: 'active' };
        },
      },
    });

    const { inventoryService, store } = module;
    const actor = { actorId: 'owner-1' };

    await inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-expiry',
        quantity: '1',
        batchNumber: 'LOT-EARLY',
        expiryDate: '2027-03-01',
        inventoryValue: { amount: '100.00', currency: 'PKR' },
      },
      actor,
      'open-early',
    );
    await inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-expiry',
        quantity: '1',
        batchNumber: 'LOT-LATE',
        expiryDate: '2027-08-01',
        inventoryValue: { amount: '100.00', currency: 'PKR' },
      },
      actor,
      'open-late',
    );

    const allocation = await inventoryService.allocateStockForProduct('org-1', {
      warehouseId: 'wh-1',
      productId: 'prod-expiry',
      quantityBaseMinorUnits: '15000',
    });
    expect(allocation.allocations[0].batchNumber).toBe('LOT-EARLY');
    expect(allocation.allocations[1].batchNumber).toBe('LOT-LATE');

    const expiry = await inventoryService.queryExpiry('org-1', {}, ownerContext());
    expect(expiry.items.some((item) => item.classification === 'normal')).toBe(true);

    await inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-none',
        quantity: '1',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      },
      actor,
      'open-none',
    );

    const draft = await inventoryService.createAdjustmentDraft(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-none',
        adjustmentType: 'damage',
        quantity: '2',
        reason: 'Broken bags',
      },
      ownerContext(),
    );
    expect(draft.status).toBe('draft');

    await expect(
      inventoryService.postAdjustment(
        'org-1',
        draft.id,
        { reason: 'Broken bags' },
        actor,
        ownerContext(),
        'adj-post-1',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const managerDraft = await inventoryService.createAdjustmentDraft(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-none',
        adjustmentType: 'loss',
        quantity: '5',
        reason: 'Shrinkage',
      },
      managerContext(),
    );

    await expect(
      inventoryService.postAdjustment(
        'org-1',
        managerDraft.id,
        {
          reason: 'Shrinkage',
          negativeStockOverride: true,
          negativeStockOverrideReason: 'No permission',
        },
        { actorId: 'manager-1' },
        managerContext(),
        'adj-post-manager',
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    const postedResult = await inventoryService.postAdjustment(
      'org-1',
      draft.id,
      {
        reason: 'Broken bags',
        negativeStockOverride: true,
        negativeStockOverrideReason: 'Emergency write-off approved',
      },
      actor,
      ownerContext(),
      'adj-post-2',
    );
    const posted = postedResult.data;
    expect(posted.status).toBe('posted');

    const balances = await inventoryService.listBalances('org-1', { productId: 'prod-none' }, ownerContext());
    expect(balances.items[0].quantityBase).toBe('-1.0000');

    const reversedResult = await inventoryService.reverseAdjustment(
      'org-1',
      posted.id,
      { reason: 'Posted in error' },
      actor,
      ownerContext(),
      'adj-reverse-1',
    );
    const reversed = reversedResult.data;
    expect(reversed.reversalOfId).toBe(posted.id);

    const afterReverse = await inventoryService.listBalances('org-1', { productId: 'prod-none' }, ownerContext());
    expect(afterReverse.items[0].quantityBase).toBe('1.0000');

    await expect(
      inventoryService.reverseAdjustment(
        'org-1',
        posted.id,
        { reason: 'Duplicate reverse' },
        actor,
        ownerContext(),
        'adj-reverse-2',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const sum = await store.sumMovementSignedQuantity('org-1', {
      warehouseId: 'wh-1',
      productId: 'prod-none',
      batchId: null,
    });
    expect(sum).toBe('10000');
  });
});
