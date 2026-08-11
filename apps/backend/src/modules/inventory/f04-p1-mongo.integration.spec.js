import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { ProductBatchModel } = require('./persistence/product-batch.model');
const { StockMovementModel } = require('./persistence/stock-movement.model');
const { InventoryBalanceModel } = require('./persistence/inventory-balance.model');
const { InventoryCostStateModel } = require('./persistence/inventory-cost-state.model');
const { createInventoryModule } = require('./inventory.module');
const { createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F04 P1 inventory Mongo indexes, transactions, concurrency', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f04p1_${Date.now()}`;
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
    await Promise.all([
      ProductBatchModel.syncIndexes(),
      StockMovementModel.syncIndexes(),
      InventoryBalanceModel.syncIndexes(),
      InventoryCostStateModel.syncIndexes(),
    ]);
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('enforces unique batch identity and balance/cost scopes', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo index proof');
    }

    const organizationId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const warehouseId = new mongoose.Types.ObjectId();

    await ProductBatchModel.create({
      organizationId,
      productId,
      batchNumber: 'LOT-1',
      manufacturingDate: null,
      expiryDate: '2027-01-01',
      firstReceivedAt: new Date(),
    });
    await expect(
      ProductBatchModel.create({
        organizationId,
        productId,
        batchNumber: 'LOT-1',
        manufacturingDate: null,
        expiryDate: '2027-02-01',
        firstReceivedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await InventoryBalanceModel.create({
      organizationId,
      warehouseId,
      productId,
      batchId: null,
      quantityBaseMinorUnits: '10000',
      version: 1,
    });
    await expect(
      InventoryBalanceModel.create({
        organizationId,
        warehouseId,
        productId,
        batchId: null,
        quantityBaseMinorUnits: '20000',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await InventoryCostStateModel.create({
      organizationId,
      warehouseId,
      productId,
      quantityBaseMinorUnits: '10000',
      inventoryValueMinorUnits: '1000',
      weightedAverageCostMinorUnits: '100',
      lastWeightedAverageCostMinorUnits: '100',
      version: 1,
    });
    await expect(
      InventoryCostStateModel.create({
        organizationId,
        warehouseId,
        productId,
        quantityBaseMinorUnits: '20000',
        inventoryValueMinorUnits: '2000',
        weightedAverageCostMinorUnits: '100',
        lastWeightedAverageCostMinorUnits: '100',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rolls back opening stock when audit fails inside the transaction', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo transaction proof');
    }

    const organizationId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      idempotencyStore: createMongooseIdempotencyStore(),
      catalogService: {
        async getProduct() {
          return {
            id: productId,
            trackingMode: 'none',
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
          return { id: warehouseId, status: 'active' };
        },
      },
      canAccessWarehouse: () => true,
    });

    inventory.store.appendAuditEvent = async () => {
      throw new Error('forced audit failure');
    };

    await expect(
      inventory.inventoryService.postOpeningStock(
        organizationId,
        {
          warehouseId,
          productId,
          quantity: '5',
          inventoryValue: { amount: '50.00', currency: 'PKR' },
        },
        { actorId },
        'mongo-rollback-key',
      ),
    ).rejects.toThrow(/forced audit failure/);

    expect(
      await StockMovementModel.countDocuments({ organizationId }).exec(),
    ).toBe(0);
    expect(
      await InventoryBalanceModel.countDocuments({ organizationId }).exec(),
    ).toBe(0);
    expect(
      await InventoryCostStateModel.countDocuments({ organizationId }).exec(),
    ).toBe(0);
  });

  it('keeps concurrent balance updates consistent with movement sums', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo concurrency proof');
    }

    const organizationId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      idempotencyStore: createMongooseIdempotencyStore(),
      catalogService: {
        async getProduct() {
          return {
            id: productId,
            trackingMode: 'none',
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
          return { id: warehouseId, status: 'active' };
        },
      },
      canAccessWarehouse: () => true,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        inventory.inventoryService.postOpeningStock(
          organizationId,
          {
            warehouseId,
            productId,
            quantity: '1',
            inventoryValue: { amount: '10.00', currency: 'PKR' },
          },
          { actorId },
          `mongo-concurrent-${index}`,
        ),
      ),
    );

    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);

    const balance = await inventory.store.findBalance(
      organizationId,
      warehouseId,
      productId,
      null,
    );
    const sum = await inventory.store.sumMovementSignedQuantity(organizationId, {
      warehouseId,
      productId,
      batchId: null,
    });
    expect(balance.quantityBaseMinorUnits).toBe(sum);

    const cost = await inventory.store.findCostState(organizationId, warehouseId, productId);
    expect(cost.quantityBaseMinorUnits).toBe(sum);
  });
});
