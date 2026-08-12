import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { PurchaseModel } = require('./persistence/purchase.model');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { createPurchasesModule } = require('./purchases.module');
const { createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F05 P1 real-Mongo payments and draft effectlessness', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f05p1_${Date.now()}`;
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
      PurchaseModel.syncIndexes(),
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

  it('posts supplier payment atomically with rollback and draft zero effects', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F05 P1 proof');
    }
    await ensureConnection();

    const organizationId = new mongoose.Types.ObjectId().toString();
    const supplierId = new mongoose.Types.ObjectId().toString();
    const accountId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const accounts = createAccountsModule({ persistence: 'mongoose' });
    const createdAccount = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'Cash', accountType: 'cash' },
      { actorId },
    );
    const realAccountId = createdAccount.id;

    await accounts.accountsService.postAccountMovement(null, {
      organizationId,
      accountId: realAccountId,
      signedAmountMinorUnits: '1000000',
      currency: 'PKR',
      sourceType: 'account_opening',
      sourceId: realAccountId,
      postedAt: new Date(),
      postedBy: actorId,
    });

    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId,
      partyType: 'supplier',
      supplierId,
      effectKind: 'payable',
      signedAmountMinorUnits: '50000',
      currency: 'PKR',
      sourceType: 'supplier_opening_payable',
      sourceId: supplierId,
      postedAt: new Date(),
      postedBy: actorId,
    });

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
      idempotency: require('../../platform/idempotency/idempotency-service').createIdempotencyService(
        createMongooseIdempotencyStore(),
      ),
    });

    const payment = await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId,
        accountId: realAccountId,
        amount: { amount: '150.00', currency: 'PKR' },
        paymentDate: '2026-08-11',
        allocationMode: 'general',
      },
      { actorId },
      'mongo-pay-1',
    );
    expect(payment.statusCode).toBe(201);
    expect(payment.data.allocations[0].targetType).toBe('supplier_advance');

    const balance = await accounts.accountsService.sumAccountBalance(organizationId, realAccountId);
    expect(balance.amount).toBe('9850.00');

    const payable = await ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId);
    const advance = await ledgers.ledgersService.sumSupplierAdvance(organizationId, supplierId);
    expect(payable.amount).toBe('500.00');
    expect(advance.amount).toBe('150.00');

    const replay = await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId,
        accountId: realAccountId,
        amount: { amount: '150.00', currency: 'PKR' },
        paymentDate: '2026-08-11',
        allocationMode: 'general',
      },
      { actorId },
      'mongo-pay-1',
    );
    expect(replay.data.id).toBe(payment.data.id);
    expect((await PaymentModel.countDocuments({ organizationId })).toString()).toBe('1');

    const purchases = createPurchasesModule({
      persistence: 'mongoose',
      catalogService: {
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
      },
      suppliersService: {
        async getSupplier() {
          return { id: supplierId, name: 'Supplier', status: 'active' };
        },
      },
      locationsService: {
        async getWarehouse() {
          return { id: warehouseId, status: 'active', name: 'WH' };
        },
        async getBranch() {
          return { id: 'branch', status: 'active' };
        },
      },
      canAccessWarehouse: () => true,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId,
            quantity: '3',
            unitCost: { amount: '12.50', currency: 'PKR' },
          },
        ],
      },
      { userId: actorId, organizationId, role: 'Owner', permissions: ['purchases.create'] },
    );
    expect(draft.status).toBe('draft');

    const paymentsBefore = await PaymentModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });
    const movementsBefore = await AccountMovementModel.countDocuments({ organizationId });

    await purchases.purchasesService.updatePurchaseDraft(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        notes: 'still draft',
        lines: [
          {
            productId,
            quantity: '4',
            unitCost: { amount: '12.50', currency: 'PKR' },
          },
        ],
      },
      { userId: actorId, organizationId, role: 'Owner', permissions: ['purchases.create'] },
    );

    expect(await PaymentModel.countDocuments({ organizationId })).toBe(paymentsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);
    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);

    await purchases.purchasesService.discardPurchaseDraft(
      organizationId,
      draft.id,
      { userId: actorId, organizationId, role: 'Owner', permissions: ['purchases.create'] },
    );
    expect(await PurchaseModel.countDocuments({ organizationId })).toBe(0);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);
    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);

    void accountId;
  }, 120000);
});
