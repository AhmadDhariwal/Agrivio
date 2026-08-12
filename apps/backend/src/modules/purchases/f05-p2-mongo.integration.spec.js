import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { StockMovementModel } = require('../inventory/persistence/stock-movement.model');
const { PurchaseModel } = require('./persistence/purchase.model');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { createInventoryModule } = require('../inventory/inventory.module');
const { createPurchasesModule } = require('./purchases.module');
const {
  createIdempotencyService,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { IdempotencyRecordModel } = require('../../platform/idempotency/persistence/idempotency-record.model');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F05 P2 real-Mongo purchase posting', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f05p2_${Date.now()}`;
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
    await Promise.all([
      PaymentModel.syncIndexes(),
      PaymentAllocationModel.syncIndexes(),
      LedgerEffectModel.syncIndexes(),
      AccountMovementModel.syncIndexes(),
      StockMovementModel.syncIndexes(),
      PurchaseModel.syncIndexes(),
      IdempotencyRecordModel.syncIndexes(),
    ]);
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

  it('posts atomically with rollback, concurrent safety, and reconciliation', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F05 P2 proof');
    }
    await ensureConnection();

    const organizationId = new mongoose.Types.ObjectId().toString();
    const supplierId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const accounts = createAccountsModule({ persistence: 'mongoose' });
    const createdAccount = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'Cash', accountType: 'cash' },
      { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId,
      accountId: createdAccount.id,
      signedAmountMinorUnits: '1000000',
      currency: 'PKR',
      sourceType: 'account_opening',
      sourceId: createdAccount.id,
      postedAt: new Date(),
      postedBy: actorId,
    });

    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    const paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      suppliersService: {
        async getSupplier(orgId, id) {
          if (String(orgId) !== organizationId || String(id) !== supplierId) {
            const error = new Error('Supplier not found');
            error.code = 'NOT_FOUND';
            throw error;
          }
          return { id: supplierId, status: 'active', name: 'Supplier' };
        },
      },
      idempotency: createIdempotencyService(createMongooseIdempotencyStore()),
    });

    const catalogService = {
      async getProduct(orgId, id) {
        return {
          id,
          name: 'Seed',
          trackingMode: 'none',
          baseUnitCode: 'EA',
          status: 'active',
        };
      },
      async listPackagingUnits() {
        return { items: [] };
      },
    };
    const locationsService = {
      async getWarehouse() {
        return { id: warehouseId, status: 'active', name: 'WH' };
      },
      async getBranch() {
        return { id: 'branch', status: 'active', name: 'Branch' };
      },
    };

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      catalogService,
      locationsService,
      canAccessWarehouse: () => true,
      hasPermission: () => true,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
    });

    const sharedIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const purchases = createPurchasesModule({
      persistence: 'mongoose',
      catalogService,
      suppliersService: {
        async getSupplier() {
          return { id: supplierId, name: 'Supplier', status: 'active' };
        },
      },
      locationsService,
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      canAccessWarehouse: () => true,
      canAccessBranch: () => true,
      idempotency: sharedIdempotency,
    });

    const auth = {
      userId: actorId,
      organizationId,
      role: 'Owner',
      permissions: ['purchases.create', 'purchases.post', 'purchases.view'],
    };

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId,
            quantity: '4',
            unitCost: { amount: '25.00', currency: 'PKR' },
          },
        ],
        landedCosts: {
          freight: { amount: '20.00', currency: 'PKR' },
        },
      },
      auth,
    );

    const posted = await purchases.purchasesService.postPurchase(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        payments: [
          {
            accountId: createdAccount.id,
            amount: { amount: '50.00', currency: 'PKR' },
          },
        ],
      },
      auth,
      'mongo-post-1',
    );
    expect(posted.statusCode).toBe(200);
    expect(posted.data.status).toBe('posted');
    expect(posted.data.purchaseTotal.amount).toBe('120.00');
    expect(posted.data.paidTotal.amount).toBe('50.00');
    expect(posted.data.payableTotal.amount).toBe('70.00');

    expect(await PurchaseModel.countDocuments({ organizationId, status: 'posted' })).toBe(1);
    expect(await StockMovementModel.countDocuments({ organizationId, sourceType: 'purchase' })).toBe(1);
    expect(await LedgerEffectModel.countDocuments({ organizationId, sourceType: 'purchase_payable' })).toBe(1);
    expect(await PaymentModel.countDocuments({ organizationId })).toBe(1);
    expect(
      await AccountMovementModel.countDocuments({ organizationId, sourceType: 'purchase_payment' }),
    ).toBe(1);

    const balance = await accounts.accountsService.sumAccountBalance(organizationId, createdAccount.id);
    expect(balance.amount).toBe('9950.00');

    const payable = await ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId);
    expect(payable.amount).toBe('70.00');

    const reconciliation = await inventory.inventoryService.reconcileInventory(organizationId, auth);
    expect(reconciliation.ok).toBe(true);

    await ensureConnection();
    const replay = await purchases.purchasesService.postPurchase(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        payments: [
          {
            accountId: createdAccount.id,
            amount: { amount: '50.00', currency: 'PKR' },
          },
        ],
      },
      auth,
      'mongo-post-1',
    );
    expect(replay.data.id).toBe(posted.data.id);
    expect(await StockMovementModel.countDocuments({ organizationId, sourceType: 'purchase' })).toBe(1);

    const concurrentDraft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId,
            quantity: '1',
            unitCost: { amount: '10.00', currency: 'PKR' },
          },
        ],
      },
      auth,
    );

    const [first, second] = await Promise.allSettled([
      purchases.purchasesService.postPurchase(
        organizationId,
        concurrentDraft.id,
        { expectedVersion: concurrentDraft.version, payments: [] },
        auth,
        'concurrent-a',
      ),
      purchases.purchasesService.postPurchase(
        organizationId,
        concurrentDraft.id,
        { expectedVersion: concurrentDraft.version, payments: [] },
        auth,
        'concurrent-b',
      ),
    ]);

    const successes = [first, second].filter((item) => item.status === 'fulfilled');
    const failures = [first, second].filter((item) => item.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(await PurchaseModel.countDocuments({ _id: concurrentDraft.id, status: 'posted' })).toBe(1);

    // Rollback: force inventory failure mid-post
    const rollbackDraft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId,
            quantity: '2',
            unitCost: { amount: '15.00', currency: 'PKR' },
          },
        ],
      },
      auth,
    );

    const originalReceipt = inventory.inventoryService.postInboundReceiptInSession.bind(
      inventory.inventoryService,
    );
    let calls = 0;
    inventory.inventoryService.postInboundReceiptInSession = async (...args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('simulated inventory failure');
      }
      return originalReceipt(...args);
    };

    const movementsBefore = await StockMovementModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });
    const paymentsBefore = await PaymentModel.countDocuments({ organizationId });

    await expect(
      purchases.purchasesService.postPurchase(
        organizationId,
        rollbackDraft.id,
        { expectedVersion: rollbackDraft.version, payments: [] },
        auth,
        'rollback-1',
      ),
    ).rejects.toThrow(/simulated inventory failure/);

    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);
    expect(await PaymentModel.countDocuments({ organizationId })).toBe(paymentsBefore);
    const stillDraft = await PurchaseModel.findOne({ _id: rollbackDraft.id }).lean().exec();
    expect(stillDraft.status).toBe('draft');

    inventory.inventoryService.postInboundReceiptInSession = originalReceipt;
  }, 120000);
});
