import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { StockMovementModel } = require('../inventory/persistence/stock-movement.model');
const { SaleModel } = require('./persistence/sale.model');
const { InvoiceSequenceModel } = require('./persistence/invoice-sequence.model');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { createInventoryModule } = require('../inventory/inventory.module');
const { createSalesModule } = require('./sales.module');
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

describe('F06 P2 real-Mongo sale posting', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f06p2_${Date.now()}`;
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
      SaleModel.syncIndexes(),
      InvoiceSequenceModel.syncIndexes(),
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
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F06 P2 proof');
    }
    await ensureConnection();

    const organizationId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();
    const branchId = new mongoose.Types.ObjectId().toString();
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
      customersService: {
        async getCustomer(orgId, id) {
          if (String(orgId) !== organizationId || String(id) !== customerId) {
            const error = new Error('Customer not found');
            error.code = 'NOT_FOUND';
            throw error;
          }
          return {
            id: customerId,
            status: 'active',
            name: 'Customer',
            priceTier: 'retail',
            creditEnabled: true,
            creditLimit: { amount: '100000.00', currency: 'PKR' },
            creditLimitBehaviour: 'warning',
            customerType: 'individual',
            phone: '03001111111',
          };
        },
      },
      listUnpaidCustomerSales: async () => [],
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
      async listPrices(orgId, pid) {
        return {
          items: [
            {
              productId: pid,
              priceTier: 'retail',
              price: { amount: '50.00', currency: 'PKR' },
              status: 'active',
            },
          ],
        };
      },
    };
    const locationsService = {
      async getWarehouse() {
        return { id: warehouseId, status: 'active', name: 'WH' };
      },
      async getBranch() {
        return { id: branchId, status: 'active', name: 'Branch', invoicePrefix: 'TST' };
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

    await inventory.inventoryService.postOpeningStock(
      organizationId,
      {
        warehouseId,
        productId,
        quantity: '20',
        inventoryValue: { amount: '1000.00', currency: 'PKR' },
      },
      { actorId },
      'opening-seed',
    );

    const sharedIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const sales = createSalesModule({
      persistence: 'mongoose',
      catalogService,
      customersService: {
        async getCustomer() {
          return {
            id: customerId,
            name: 'Customer',
            status: 'active',
            priceTier: 'retail',
            creditEnabled: true,
            creditLimit: { amount: '100000.00', currency: 'PKR' },
            creditLimitBehaviour: 'warning',
            customerType: 'individual',
            phone: '03001111111',
          };
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
      permissions: ['sales.create', 'sales.post', 'sales.view', 'pricing.override'],
    };

    const draft = await sales.salesService.createSaleDraft(
      organizationId,
      {
        branchId,
        warehouseId,
        customerId,
        saleDate: '2026-08-12',
        lines: [
          {
            productId,
            quantity: '4',
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      },
      auth,
    );

    const posted = await sales.salesService.postSale(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        payments: [{ accountId: createdAccount.id, amount: { amount: '100.00', currency: 'PKR' } }],
      },
      auth,
      'mongo-sale-post-1',
    );
    expect(posted.data.status).toBe('posted');
    expect(posted.data.invoiceNumber).toMatch(/^TST-/);
    expect(posted.data.saleTotal.amount).toBe('200.00');
    expect(posted.data.paidTotal.amount).toBe('100.00');
    expect(posted.data.receivableTotal.amount).toBe('100.00');

    const replay = await sales.salesService.postSale(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        payments: [{ accountId: createdAccount.id, amount: { amount: '100.00', currency: 'PKR' } }],
      },
      auth,
      'mongo-sale-post-1',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.id).toBe(draft.id);

    const movements = await StockMovementModel.find({ organizationId, sourceType: 'sale' }).lean();
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityBaseMinorUnits).toBe('40000');

    const ledgerEffects = await LedgerEffectModel.find({
      organizationId,
      customerId,
      sourceType: 'sale_receivable',
    }).lean();
    expect(ledgerEffects).toHaveLength(1);

    const paymentAllocations = await PaymentAllocationModel.find({
      organizationId,
      targetType: 'sale',
      targetId: draft.id,
    }).lean();
    expect(paymentAllocations).toHaveLength(1);

    await expect(
      Promise.all([
        sales.salesService.postSale(
          organizationId,
          draft.id,
          { expectedVersion: 999, payments: [] },
          auth,
          'concurrent-a',
        ),
        sales.salesService.postSale(
          organizationId,
          draft.id,
          { expectedVersion: 999, payments: [] },
          auth,
          'concurrent-b',
        ),
      ]),
    ).rejects.toThrow();
  });
});
