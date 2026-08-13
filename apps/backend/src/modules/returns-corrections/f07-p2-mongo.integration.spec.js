import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { StockMovementModel } = require('../inventory/persistence/stock-movement.model');
const { SaleModel } = require('../sales/persistence/sale.model');
const { InvoiceSequenceModel } = require('../sales/persistence/invoice-sequence.model');
const { ReturnModel } = require('./persistence/return.model');
const { CorrectiveTransactionModel } = require('./persistence/corrective-transaction.model');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { createInventoryModule } = require('../inventory/inventory.module');
const { createSalesModule } = require('../sales/sales.module');
const { createReturnsModule } = require('./returns.module');
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

describe('F07 P2 real-Mongo return reversal', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f07p2_${Date.now()}`;
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
      ReturnModel.syncIndexes(),
      CorrectiveTransactionModel.syncIndexes(),
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

  function buildModules() {
    const organizationId = new mongoose.Types.ObjectId().toString();
    const customerId = new mongoose.Types.ObjectId().toString();
    const branchId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const catalogService = {
      async getProduct() {
        return {
          id: productId,
          name: 'Seed',
          trackingMode: 'none',
          baseUnitCode: 'EA',
          status: 'active',
        };
      },
      async listPackagingUnits() {
        return { items: [] };
      },
      async listPrices() {
        return {
          items: [
            {
              productId,
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
        return { id: branchId, status: 'active', name: 'Branch', invoicePrefix: 'F7R' };
      },
    };
    const customersService = {
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
    };

    const accounts = createAccountsModule({ persistence: 'mongoose' });
    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    const sharedIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      customersService,
      listUnpaidCustomerSales: async () => [],
      idempotency: sharedIdempotency,
    });
    const inventory = createInventoryModule({
      persistence: 'mongoose',
      catalogService,
      locationsService,
      canAccessWarehouse: () => true,
      hasPermission: () => true,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
    });
    const sales = createSalesModule({
      persistence: 'mongoose',
      catalogService,
      customersService,
      locationsService,
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      canAccessWarehouse: () => true,
      canAccessBranch: () => true,
      idempotency: sharedIdempotency,
    });
    const returnsModule = createReturnsModule({
      persistence: 'mongoose',
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      salesService: sales.salesService,
      catalogService,
      customersService,
      locationsService,
      canAccessWarehouse: () => true,
      idempotency: sharedIdempotency,
    });

    const auth = {
      userId: actorId,
      organizationId,
      role: 'Owner',
      permissions: [
        'sales.create',
        'sales.post',
        'sales.view',
        'returns.post',
        'returns.reverse',
        'returns.without-invoice.approve',
      ],
    };

    return {
      organizationId,
      customerId,
      branchId,
      warehouseId,
      productId,
      actorId,
      accounts,
      inventory,
      sales,
      returnsModule,
      auth,
    };
  }

  async function seedPostedSale(modules, quantity, idempotencyKey) {
    const {
      organizationId,
      customerId,
      branchId,
      warehouseId,
      productId,
      actorId,
      accounts,
      inventory,
      sales,
      auth,
    } = modules;

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

    await inventory.inventoryService.postOpeningStock(
      organizationId,
      {
        warehouseId,
        productId,
        quantity: '20',
        inventoryValue: { amount: '1000.00', currency: 'PKR' },
      },
      { actorId },
      `${idempotencyKey}-opening`,
    );

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
            quantity,
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      },
      auth,
    );
    const posted = await sales.salesService.postSale(
      organizationId,
      draft.id,
      { expectedVersion: draft.version, payments: [] },
      auth,
      idempotencyKey,
    );
    return { posted: posted.data, cashAccountId: createdAccount.id };
  }

  async function postLinkedReturn(modules, saleId, quantity, key) {
    const { organizationId, returnsModule, auth } = modules;
    const draft = await returnsModule.returnsService.createSalesReturnDraft(
      organizationId,
      saleId,
      { lines: [{ originalLineIndex: 0, quantity, stockCondition: 'sellable' }] },
      auth,
    );
    return returnsModule.returnsService.postReturn(
      organizationId,
      draft.id,
      {
        expectedVersion: draft.version,
        reason: 'Mongo linked return',
        resolution: 'ledger_adjustment',
      },
      auth,
      key,
    );
  }

  it('transaction failure rolls all reversal effects back', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const modules = buildModules();
    const { organizationId, inventory, returnsModule, auth } = modules;
    const { posted } = await seedPostedSale(modules, '5', 'f07p2-rollback-sale');
    const postedReturn = await postLinkedReturn(modules, posted.id, '2', 'f07p2-rollback-return');

    const movementsBefore = await StockMovementModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });
    const accountsBefore = await AccountMovementModel.countDocuments({ organizationId });
    const correctiveBefore = await CorrectiveTransactionModel.countDocuments({ organizationId });

    const originalOutbound = inventory.inventoryService.postOutboundIssueInSession.bind(
      inventory.inventoryService,
    );
    let calls = 0;
    inventory.inventoryService.postOutboundIssueInSession = async (...args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('simulated return-reversal outbound failure');
      }
      return originalOutbound(...args);
    };

    await expect(
      returnsModule.returnsService.reverseReturn(
        organizationId,
        postedReturn.data.id,
        { expectedVersion: postedReturn.data.version, reason: 'Forced fail' },
        auth,
        'f07p2-rollback-reverse',
      ),
    ).rejects.toThrow(/simulated return-reversal outbound failure/);

    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);
    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(accountsBefore);
    expect(await CorrectiveTransactionModel.countDocuments({ organizationId })).toBe(
      correctiveBefore,
    );

    const stillPosted = await ReturnModel.findById(postedReturn.data.id).lean().exec();
    expect(stillPosted.status).toBe('posted');
    expect(stillPosted.reversedByCorrectiveTransactionId).toBeNull();
    expect(stillPosted.reason).toBe('Mongo linked return');

    inventory.inventoryService.postOutboundIssueInSession = originalOutbound;
  }, 120000);

  it('same idempotency key cannot duplicate a return reversal', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const modules = buildModules();
    const { organizationId, returnsModule, auth } = modules;
    const { posted } = await seedPostedSale(modules, '4', 'f07p2-idem-sale');
    const postedReturn = await postLinkedReturn(modules, posted.id, '2', 'f07p2-idem-return');

    const first = await returnsModule.returnsService.reverseReturn(
      organizationId,
      postedReturn.data.id,
      {
        expectedVersion: postedReturn.data.version,
        reason: 'Idempotent reverse',
      },
      auth,
      'f07p2-idem-reverse',
    );
    expect(first.data.status).toBe('reversed');
    expect(first.data.reversedByCorrectiveTransactionId).toBeTruthy();

    const replay = await returnsModule.returnsService.reverseReturn(
      organizationId,
      postedReturn.data.id,
      {
        expectedVersion: postedReturn.data.version,
        reason: 'Idempotent reverse',
      },
      auth,
      'f07p2-idem-reverse',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.id).toBe(first.data.id);
    expect(replay.data.reversedByCorrectiveTransactionId).toBe(
      first.data.reversedByCorrectiveTransactionId,
    );

    expect(await ReturnModel.countDocuments({ organizationId, status: 'reversed' })).toBe(1);
    expect(await CorrectiveTransactionModel.countDocuments({ organizationId })).toBe(1);
    expect(
      await StockMovementModel.countDocuments({
        organizationId,
        sourceType: 'sales_return_reversal',
      }),
    ).toBe(1);
    expect(
      await LedgerEffectModel.countDocuments({
        organizationId,
        sourceType: 'sales_return_reversal',
      }),
    ).toBe(1);

    const preserved = await ReturnModel.findById(postedReturn.data.id).lean().exec();
    expect(preserved.status).toBe('reversed');
    expect(preserved.reason).toBe('Mongo linked return');
    expect(String(preserved.reversedByCorrectiveTransactionId)).toBe(
      first.data.reversedByCorrectiveTransactionId,
    );
  }, 120000);
});
