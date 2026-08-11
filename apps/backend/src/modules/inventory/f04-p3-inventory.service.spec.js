import { describe, expect, it } from 'vitest';
import { createInventoryModule } from './inventory.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';

function ownerContext(organizationId = 'org-1') {
  return {
    userId: 'owner-1',
    organizationId,
    contextType: 'organization',
    role: 'Owner',
    permissions: permissionsForMembershipRole('Owner'),
  };
}

describe('F04 P3 warehouse transfers and reconciliation', () => {
  it('posts atomic transfer with preserved batch, reverses, and reconciles', async () => {
    const module = createInventoryModule({
      persistence: 'memory',
      hasPermission: (authContext, permission) =>
        (authContext.permissions ?? []).includes(permission),
      canAccessWarehouse: () => true,
      catalogService: {
        async getProduct(_organizationId, productId) {
          if (productId === 'prod-batch') {
            return {
              id: 'prod-batch',
              trackingMode: 'batch_expiry',
              baseUnitCode: 'KG',
              status: 'active',
            };
          }
          return {
            id: productId,
            trackingMode: 'none',
            baseUnitCode: 'EA',
            status: 'active',
          };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse(_organizationId, warehouseId) {
          return { id: warehouseId, status: 'active' };
        },
      },
    });

    const { inventoryService, store } = module;
    const actor = { actorId: 'owner-1' };
    const auth = ownerContext();

    await inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-source',
        productId: 'prod-batch',
        quantity: '5',
        batchNumber: 'LOT-T1',
        expiryDate: '2027-12-31',
        inventoryValue: { amount: '500.00', currency: 'PKR' },
      },
      actor,
      'open-transfer-source',
    );

    const batches = await inventoryService.listBatches('org-1', { productId: 'prod-batch' });
    const batchId = batches.items[0].id;

    await expect(
      inventoryService.createTransferDraft(
        'org-1',
        {
          sourceWarehouseId: 'wh-source',
          destinationWarehouseId: 'wh-source',
          productId: 'prod-batch',
          batchId,
          quantity: '2',
          reason: 'same warehouse',
        },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const draft = await inventoryService.createTransferDraft(
      'org-1',
      {
        sourceWarehouseId: 'wh-source',
        destinationWarehouseId: 'wh-dest',
        productId: 'prod-batch',
        batchId,
        quantity: '2',
        reason: 'Move stock',
      },
      auth,
    );
    expect(draft.status).toBe('draft');

    const posted = await inventoryService.postTransfer(
      'org-1',
      draft.id,
      { reason: 'Move stock' },
      actor,
      auth,
      'transfer-post-1',
    );
    expect(posted.data.status).toBe('posted');
    expect(posted.data.batchId).toBe(batchId);
    expect(posted.data.outboundMovementId).toBeTruthy();
    expect(posted.data.inboundMovementId).toBeTruthy();
    expect(posted.data.outboundMovementId).not.toBe(posted.data.inboundMovementId);

    const sourceBalances = await inventoryService.listBalances(
      'org-1',
      { warehouseId: 'wh-source', productId: 'prod-batch' },
      auth,
    );
    const destBalances = await inventoryService.listBalances(
      'org-1',
      { warehouseId: 'wh-dest', productId: 'prod-batch' },
      auth,
    );
    expect(sourceBalances.items[0].quantityBase).toBe('3.0000');
    expect(destBalances.items[0].quantityBase).toBe('2.0000');
    expect(destBalances.items[0].batchId).toBe(batchId);

    const replay = await inventoryService.postTransfer(
      'org-1',
      draft.id,
      { reason: 'Move stock' },
      actor,
      auth,
      'transfer-post-1',
    );
    expect(replay.replay).toBe(true);

    await expect(
      inventoryService.postTransfer(
        'org-1',
        draft.id,
        { reason: 'different body' },
        actor,
        auth,
        'transfer-post-1',
      ),
    ).rejects.toBeTruthy();

    const overspend = await inventoryService.createTransferDraft(
      'org-1',
      {
        sourceWarehouseId: 'wh-source',
        destinationWarehouseId: 'wh-dest',
        productId: 'prod-batch',
        batchId,
        quantity: '10',
        reason: 'Too much',
      },
      auth,
    );
    await expect(
      inventoryService.postTransfer(
        'org-1',
        overspend.id,
        { reason: 'Too much' },
        actor,
        auth,
        'transfer-overspend',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const movementsAfterFailed = await store.listMovements('org-1', {
      warehouseId: 'wh-source',
      productId: 'prod-batch',
    });
    expect(
      movementsAfterFailed.filter((item) => item.sourceType === 'warehouse_transfer').length,
    ).toBe(1);

    const reversed = await inventoryService.reverseTransfer(
      'org-1',
      posted.data.id,
      { reason: 'Undo move' },
      actor,
      auth,
      'transfer-reverse-1',
    );
    expect(reversed.data.status).toBe('posted');
    expect(reversed.data.reversalOfId).toBe(posted.data.id);

    await expect(
      inventoryService.reverseTransfer(
        'org-1',
        posted.data.id,
        { reason: 'Undo again' },
        actor,
        auth,
        'transfer-reverse-2',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const sourceAfter = await inventoryService.listBalances(
      'org-1',
      { warehouseId: 'wh-source', productId: 'prod-batch' },
      auth,
    );
    const destAfter = await inventoryService.listBalances(
      'org-1',
      { warehouseId: 'wh-dest', productId: 'prod-batch' },
      auth,
    );
    expect(sourceAfter.items[0].quantityBase).toBe('5.0000');
    expect(destAfter.items[0].quantityBase).toBe('0.0000');

    const recon = await inventoryService.reconcileInventory('org-1', auth);
    expect(recon.ok).toBe(true);

    const sourceBalance = (await store.listBalances('org-1', { warehouseId: 'wh-source' }))[0];
    await store.updateBalanceConditional(
      null,
      'org-1',
      sourceBalance._id,
      Number(sourceBalance.version),
      { quantityBaseMinorUnits: '1' },
    );
    const broken = await inventoryService.reconcileInventory('org-1', auth);
    expect(broken.ok).toBe(false);
    expect(
      broken.findings.some((item) => item.code === 'MOVEMENT_BALANCE_QUANTITY_MISMATCH'),
    ).toBe(true);
  });

  it('enforces warehouse permission on transfer create', async () => {
    const module = createInventoryModule({
      persistence: 'memory',
      hasPermission: (authContext, permission) =>
        (authContext.permissions ?? []).includes(permission),
      canAccessWarehouse: (_auth, warehouseId) => warehouseId === 'wh-allowed',
      catalogService: {
        async getProduct() {
          return { id: 'prod-none', trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse(_organizationId, warehouseId) {
          return { id: warehouseId, status: 'active' };
        },
      },
    });

    await expect(
      module.inventoryService.createTransferDraft(
        'org-1',
        {
          sourceWarehouseId: 'wh-allowed',
          destinationWarehouseId: 'wh-denied',
          productId: 'prod-none',
          quantity: '1',
          reason: 'cross',
        },
        ownerContext(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps org A transfers invisible to org B', async () => {
    const module = createInventoryModule({
      persistence: 'memory',
      hasPermission: () => true,
      canAccessWarehouse: () => true,
      catalogService: {
        async getProduct() {
          return { id: 'prod-none', trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse(_organizationId, warehouseId) {
          return { id: warehouseId, status: 'active' };
        },
      },
    });

    await module.inventoryService.postOpeningStock(
      'org-a',
      {
        warehouseId: 'wh-a1',
        productId: 'prod-none',
        quantity: '2',
        inventoryValue: { amount: '20.00', currency: 'PKR' },
      },
      { actorId: 'owner-a' },
      'open-a',
    );
    const draft = await module.inventoryService.createTransferDraft(
      'org-a',
      {
        sourceWarehouseId: 'wh-a1',
        destinationWarehouseId: 'wh-a2',
        productId: 'prod-none',
        quantity: '1',
        reason: 'A only',
      },
      ownerContext('org-a'),
    );
    const listedB = await module.inventoryService.listTransfers('org-b', {}, ownerContext('org-b'));
    expect(listedB.items).toEqual([]);
    await expect(
      module.inventoryService.getTransfer('org-b', draft.id, ownerContext('org-b')),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
