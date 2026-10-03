import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { createInventoryModule } = require('./inventory.module');
const { OpeningStockModel } = require('./persistence/opening-stock.model');
const { ProductBatchModel } = require('./persistence/product-batch.model');
const { StockMovementModel } = require('./persistence/stock-movement.model');
const { InventoryBalanceModel } = require('./persistence/inventory-balance.model');
const { InventoryCostStateModel } = require('./persistence/inventory-cost-state.model');
const { createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('draft/discard lifecycle real Mongo proof', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_draft_discard_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
    } catch {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      return;
    }
    mongoReady = await isReplicaSetPrimary();
    if (!mongoReady) {
      await mongoose.disconnect();
      return;
    }
    await Promise.all([
      OpeningStockModel.syncIndexes(),
      ProductBatchModel.syncIndexes(),
      StockMovementModel.syncIndexes(),
      InventoryBalanceModel.syncIndexes(),
      InventoryCostStateModel.syncIndexes(),
    ]);
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('proves zero-effect drafts, conditional discard/post concurrency, and posted immutability', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');

    const organizationId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    const authContext = { userId: actorId, organizationId, permissions: [] };
    const inventory = createInventoryModule({
      persistence: 'mongoose',
      idempotencyStore: createMongooseIdempotencyStore(),
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
      canAccessWarehouse: () => true,
    });

    const draft = await inventory.inventoryService.createOpeningStockDraft(
      organizationId,
      {
        warehouseId,
        productId,
        quantity: '2',
        inventoryValue: { amount: '20.00', currency: 'PKR' },
      },
      authContext,
    );
    const edited = await inventory.inventoryService.updateOpeningStockDraft(
      organizationId,
      draft.id,
      { expectedVersion: draft.version, quantity: '3' },
      authContext,
    );
    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(0);
    expect(await InventoryBalanceModel.countDocuments({ organizationId })).toBe(0);
    expect(await InventoryCostStateModel.countDocuments({ organizationId })).toBe(0);

    const raced = await Promise.allSettled([
      inventory.inventoryService.postOpeningStockDraft(
        organizationId,
        draft.id,
        { expectedVersion: edited.version },
        { actorId },
        authContext,
        'mongo-opening-draft-post',
      ),
      inventory.inventoryService.discardOpeningStockDraft(
        organizationId,
        draft.id,
        { expectedVersion: edited.version },
        authContext,
      ),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

    const record = await OpeningStockModel.findById(draft.id).lean().exec();
    if (record === null) {
      expect(await StockMovementModel.countDocuments({ organizationId })).toBe(0);
      expect(await InventoryBalanceModel.countDocuments({ organizationId })).toBe(0);
      expect(await InventoryCostStateModel.countDocuments({ organizationId })).toBe(0);
    } else {
      expect(record.status).toBe('posted');
      expect(await StockMovementModel.countDocuments({ organizationId })).toBe(1);
      expect(await InventoryBalanceModel.countDocuments({ organizationId })).toBe(1);
      expect(await InventoryCostStateModel.countDocuments({ organizationId })).toBe(1);
      await expect(
        inventory.inventoryService.discardOpeningStockDraft(
          organizationId,
          draft.id,
          { expectedVersion: record.version },
          authContext,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  }, 60000);
});
