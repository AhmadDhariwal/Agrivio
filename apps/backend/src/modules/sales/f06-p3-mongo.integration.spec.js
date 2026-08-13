import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { StockMovementModel } = require('../inventory/persistence/stock-movement.model');
const { InventoryBalanceModel } = require('../inventory/persistence/inventory-balance.model');
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

describe('F06 P3 real-Mongo approvals and sale cancellation', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f06p3_${Date.now()}`;
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
      InventoryBalanceModel.syncIndexes(),
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

  it('cancels paid sale atomically with stock/COGS/AR/payment reconciliation and idempotent retry', async () => {
    if (!mongoReady) {
      return;
    }
    await ensureConnection();

    const organizationId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    const branchId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();

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
        return { id: branchId, status: 'active', name: 'Branch', invoicePrefix: 'P3M' };
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
      'opening-seed-p3',
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
      permissions: [
        'sales.create',
        'sales.post',
        'sales.cancel',
        'sales.view',
        'pricing.override',
        'sales.credit-limit.approve',
        'sales.expired-stock.approve',
        'inventory.negative-stock.override',
      ],
    };

    const draft = await sales.salesService.createSaleDraft(
      organizationId,
      {
        branchId,
        warehouseId,
        customerId,
        saleDate: '2026-08-13',
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
      'mongo-sale-post-p3',
    );
    expect(posted.data.status).toBe('posted');
    expect(posted.data.receivableTotal.amount).toBe('100.00');

    const balanceAfterPost = await InventoryBalanceModel.findOne({
      organizationId,
      warehouseId,
      productId,
    }).lean();
    expect(balanceAfterPost.quantityBaseMinorUnits).toBe('160000');

    const cancelled = await sales.salesService.cancelSale(
      organizationId,
      draft.id,
      { expectedVersion: posted.data.version, reason: 'Mongo cancel proof' },
      auth,
      'mongo-sale-cancel-p3',
    );
    expect(cancelled.data.status).toBe('cancelled');
    expect(cancelled.data.invoiceNumber).toBe(posted.data.invoiceNumber);

    const replay = await sales.salesService.cancelSale(
      organizationId,
      draft.id,
      { expectedVersion: posted.data.version, reason: 'Mongo cancel proof' },
      auth,
      'mongo-sale-cancel-p3',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.id).toBe(draft.id);

    const balanceAfterCancel = await InventoryBalanceModel.findOne({
      organizationId,
      warehouseId,
      productId,
    }).lean();
    expect(balanceAfterCancel.quantityBaseMinorUnits).toBe('200000');

    const cancelMovements = await StockMovementModel.find({
      organizationId,
      sourceType: 'sale_cancellation',
      sourceId: draft.id,
    }).lean();
    expect(cancelMovements).toHaveLength(1);

    const cancelReceivable = await LedgerEffectModel.find({
      organizationId,
      customerId,
      sourceType: 'sale_cancellation',
    }).lean();
    expect(cancelReceivable).toHaveLength(1);
    expect(cancelReceivable[0].signedAmountMinorUnits).toBe('-20000');

    const refunds = await AccountMovementModel.find({
      organizationId,
      sourceType: 'sale_cancellation_refund',
    }).lean();
    expect(refunds.length).toBeGreaterThanOrEqual(1);

    const originalSale = await SaleModel.findById(draft.id).lean();
    expect(originalSale.status).toBe('cancelled');
    expect(originalSale.invoiceNumber).toBe(posted.data.invoiceNumber);
    expect(originalSale.saleTotalMinorUnits).toBe('20000');

    await expect(
      sales.salesService.cancelSale(
        organizationId,
        draft.id,
        { expectedVersion: cancelled.data.version, reason: 'again' },
        auth,
        'mongo-sale-cancel-again',
      ),
    ).rejects.toThrow();
  }, 120000);
});
