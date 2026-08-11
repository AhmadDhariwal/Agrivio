import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { WarehouseTransferModel } = require('./persistence/warehouse-transfer.model');
const { createInventoryModule } = require('./inventory.module');
const { createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');
const { permissionsForMembershipRole } = require('../identity/role-permissions');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F04 P3 warehouse transfer Mongo atomicity and concurrency', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f04p3_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      return;
    }
    mongoReady = await isReplicaSetPrimary();
    if (!mongoReady) {
      await mongoose.disconnect();
      return;
    }
    await WarehouseTransferModel.syncIndexes();
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('keeps transfer atomic under concurrency and supports idempotent post/reverse', async ({
    skip,
  }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F04 P3 proof');
    }

    const organizationId = new mongoose.Types.ObjectId().toString();
    const sourceWarehouseId = new mongoose.Types.ObjectId().toString();
    const destinationWarehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    const ownerContext = {
      userId: actorId,
      organizationId,
      permissions: permissionsForMembershipRole('Owner'),
      contextType: 'organization',
      role: 'Owner',
    };

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      idempotencyStore: createMongooseIdempotencyStore(),
      hasPermission: (authContext, permission) =>
        (authContext.permissions ?? []).includes(permission),
      canAccessWarehouse: () => true,
      catalogService: {
        async getProduct() {
          return { id: productId, trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
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

    await inventory.inventoryService.postOpeningStock(
      organizationId,
      {
        warehouseId: sourceWarehouseId,
        productId,
        quantity: '1',
        inventoryValue: { amount: '25.00', currency: 'PKR' },
      },
      { actorId },
      'mongo-p3-open',
    );

    const draftA = await inventory.inventoryService.createTransferDraft(
      organizationId,
      {
        sourceWarehouseId,
        destinationWarehouseId,
        productId,
        quantity: '1',
        reason: 'race A',
      },
      ownerContext,
    );
    const draftB = await inventory.inventoryService.createTransferDraft(
      organizationId,
      {
        sourceWarehouseId,
        destinationWarehouseId,
        productId,
        quantity: '1',
        reason: 'race B',
      },
      ownerContext,
    );

    const results = await Promise.allSettled([
      inventory.inventoryService.postTransfer(
        organizationId,
        draftA.id,
        { reason: 'race A' },
        { actorId },
        ownerContext,
        'mongo-p3-race-a',
      ),
      inventory.inventoryService.postTransfer(
        organizationId,
        draftB.id,
        { reason: 'race B' },
        { actorId },
        ownerContext,
        'mongo-p3-race-b',
      ),
    ]);

    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const sourceBalances = await inventory.inventoryService.listBalances(
      organizationId,
      { warehouseId: sourceWarehouseId, productId },
      ownerContext,
    );
    const destBalances = await inventory.inventoryService.listBalances(
      organizationId,
      { warehouseId: destinationWarehouseId, productId },
      ownerContext,
    );
    expect(sourceBalances.items[0].quantityBase).toBe('0.0000');
    expect(destBalances.items[0].quantityBase).toBe('1.0000');

    const postedId = fulfilled[0].value.data.id;
    const reverseKey = 'mongo-p3-reverse';
    const reversed = await inventory.inventoryService.reverseTransfer(
      organizationId,
      postedId,
      { reason: 'undo' },
      { actorId },
      ownerContext,
      reverseKey,
    );
    expect(reversed.data.reversalOfId).toBe(postedId);

    const reverseReplay = await inventory.inventoryService.reverseTransfer(
      organizationId,
      postedId,
      { reason: 'undo' },
      { actorId },
      ownerContext,
      reverseKey,
    );
    expect(reverseReplay.replay).toBe(true);

    const recon = await inventory.inventoryService.reconcileInventory(organizationId, ownerContext);
    expect(recon.ok).toBe(true);
  }, 60000);
});
