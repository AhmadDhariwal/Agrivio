import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { StockAdjustmentModel } = require('./persistence/stock-adjustment.model');
const { InventorySettingsModel } = require('./persistence/inventory-settings.model');
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

describe('F04 P2 inventory Mongo concurrency, idempotency, reversal', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f04p2_${Date.now()}`;
  let mongoReady = false;
  let mongoUri = '';

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    mongoUri = parsed.toString();
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
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
    await Promise.all([StockAdjustmentModel.syncIndexes(), InventorySettingsModel.syncIndexes()]);
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  async function ensureConnection() {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === isolatedDb) {
      return;
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }

  it('protects concurrent outbound deductions and supports idempotent adjustment posting', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F04 P2 proof');
    }
    await ensureConnection();

    const organizationId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    const ownerContext = {
      userId: actorId,
      organizationId,
      permissions: permissionsForMembershipRole('Owner'),
    };

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      idempotencyStore: createMongooseIdempotencyStore(),
      hasPermission: (authContext, permission) =>
        (authContext.permissions ?? []).includes(permission),
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      catalogService: {
        async getProduct() {
          return { id: productId, trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse() {
          return { id: warehouseId, status: 'active' };
        },
      },
    });

    await inventory.inventoryService.postOpeningStock(
      organizationId,
      {
        warehouseId,
        productId,
        quantity: '1',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      },
      { actorId },
      'mongo-open-1',
    );

    const draft = await inventory.inventoryService.createAdjustmentDraft(
      organizationId,
      {
        warehouseId,
        productId,
        adjustmentType: 'damage',
        quantity: '1',
        reason: 'Damage',
      },
      ownerContext,
    );

    const posted = await inventory.inventoryService.postAdjustment(
      organizationId,
      draft.id,
      { reason: 'Damage' },
      { actorId },
      ownerContext,
      'mongo-adj-1',
    );
    expect(posted.data.status).toBe('posted');

    const replay = await inventory.inventoryService.postAdjustment(
      organizationId,
      draft.id,
      { reason: 'Damage' },
      { actorId },
      ownerContext,
      'mongo-adj-1',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.id).toBe(posted.data.id);

    const concurrentDraft = await inventory.inventoryService.createAdjustmentDraft(
      organizationId,
      {
        warehouseId,
        productId,
        adjustmentType: 'damage',
        quantity: '1',
        reason: 'Second damage',
      },
      ownerContext,
    );

    await expect(
      inventory.inventoryService.postAdjustment(
        organizationId,
        concurrentDraft.id,
        { reason: 'Second damage' },
        { actorId },
        ownerContext,
        'mongo-adj-2',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const overridden = await inventory.inventoryService.postAdjustment(
      organizationId,
      concurrentDraft.id,
      {
        reason: 'Second damage',
        negativeStockOverride: true,
        negativeStockOverrideReason: 'Approved write-off',
      },
      { actorId },
      ownerContext,
      'mongo-adj-3',
    );
    expect(overridden.data.status).toBe('posted');

    const reversed = await inventory.inventoryService.reverseAdjustment(
      organizationId,
      overridden.data.id,
      { reason: 'Undo override' },
      { actorId },
      ownerContext,
      'mongo-adj-reverse-override',
    );
    expect(reversed.data.reversalOfId).toBe(overridden.data.id);

    const reversedPrimary = await inventory.inventoryService.reverseAdjustment(
      organizationId,
      posted.data.id,
      { reason: 'Undo' },
      { actorId },
      ownerContext,
      'mongo-adj-reverse',
    );
    expect(reversedPrimary.data.reversalOfId).toBe(posted.data.id);

    const sum = await inventory.store.sumMovementSignedQuantity(organizationId, {
      warehouseId,
      productId,
      batchId: null,
    });
    expect(sum).toBe('10000');
  });
});
