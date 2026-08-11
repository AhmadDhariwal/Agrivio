import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { LedgerEffectModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { StockMovementModel } = require('../inventory/persistence/stock-movement.model');
const { PurchaseModel } = require('./persistence/purchase.model');
const { ReturnModel } = require('../returns-corrections/persistence/return.model');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { createInventoryModule } = require('../inventory/inventory.module');
const { createPurchasesModule } = require('./purchases.module');
const { createReturnsModule } = require('../returns-corrections/returns.module');
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

describe('F05 P3 real-Mongo payments, cancellation, returns, reconciliation', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f05p3_${Date.now()}`;
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
      ReturnModel.syncIndexes(),
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

  function buildModules(orgIdOverride) {
    const organizationId = orgIdOverride ?? new mongoose.Types.ObjectId().toString();
    const supplierId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const accounts = createAccountsModule({ persistence: 'mongoose' });

    const catalogService = {
      async getProduct() {
        return { id: productId, name: 'Seed', trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
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
    const suppliersService = {
      async getSupplier(orgId, id) {
        if (String(orgId) !== organizationId || String(id) !== supplierId) {
          const error = new Error('Supplier not found');
          error.code = 'NOT_FOUND';
          throw error;
        }
        return { id: supplierId, status: 'active', name: 'Supplier' };
      },
    };

    const sharedIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    const paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      suppliersService,
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

    const returnsIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const returnsModule = createReturnsModule({
      persistence: 'mongoose',
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      canAccessWarehouse: () => true,
      idempotency: returnsIdempotency,
    });

    const purchases = createPurchasesModule({
      persistence: 'mongoose',
      catalogService,
      suppliersService,
      locationsService,
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      canAccessWarehouse: () => true,
      canAccessBranch: () => true,
      idempotency: sharedIdempotency,
      listPurchaseReturnCredits: (orgId, purchaseId) =>
        returnsModule.listPurchaseReturnCredits(orgId, purchaseId),
      listPostedReturnsByPurchase: (orgId, purchaseId) =>
        returnsModule.listPostedReturnsByPurchase(orgId, purchaseId),
    });

    returnsModule.returnsService.purchasesService = {
      getPurchaseSourceForReturn: (orgId, purchaseId) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId),
    };

    const auth = {
      userId: actorId,
      organizationId,
      role: 'Owner',
      permissions: ['purchases.create', 'purchases.post', 'purchases.view', 'purchases.cancel', 'purchases.return', 'returns.post'],
    };

    return { organizationId, supplierId, warehouseId, productId, actorId, accounts, ledgers, inventory, purchases, returnsModule, paymentsService, auth };
  }

  it('oldest-first allocation across multiple purchases', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, ledgers, purchases, paymentsService, auth } = buildModules();

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

    const listUnpaidSupplierPurchases = (orgId, suppId) =>
      purchases.purchasesService.listUnpaidSupplierPurchases(orgId, suppId);

    async function postCreditPurchase(purchaseDate, label) {
      const draft = await purchases.purchasesService.createPurchaseDraft(
        organizationId,
        {
          warehouseId, supplierId, purchaseDate,
          lines: [{ productId, quantity: '10', unitCost: { amount: '100.00', currency: 'PKR' } }],
          landedCosts: {},
        },
        auth,
      );
      const posted = await purchases.purchasesService.postPurchase(
        organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, `oldest-first-${label}`,
      );
      expect(posted.data.status).toBe('posted');
      return posted.data;
    }

    const p1 = await postCreditPurchase('2026-08-01', 'p1');
    const p2 = await postCreditPurchase('2026-08-05', 'p2');
    const p3 = await postCreditPurchase('2026-08-10', 'p3');

    void p3;

    // Pay 1500 — should cover p1 (1000) + 500 from p2
    const payResult = await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId,
        accountId: createdAccount.id,
        amount: { amount: '1500.00', currency: 'PKR' },
        paymentDate: '2026-08-12',
        allocationMode: 'general',
      },
      { actorId },
      'oldest-first-pay-1',
    );
    expect(payResult.statusCode).toBe(201);

    const allocations = payResult.data.allocations.filter((a) => a.targetType === 'purchase');
    expect(allocations.length).toBeGreaterThanOrEqual(2);

    const p1Alloc = allocations.find((a) => a.targetId === p1.id);
    const p2Alloc = allocations.find((a) => a.targetId === p2.id);
    expect(p1Alloc).toBeDefined();
    expect(BigInt(p1Alloc.allocatedAmountMinorUnits)).toBe(100000n);
    expect(p2Alloc).toBeDefined();
    expect(BigInt(p2Alloc.allocatedAmountMinorUnits)).toBe(50000n);

    // p1 should now be absent from unpaid
    const unpaid = await listUnpaidSupplierPurchases(organizationId, supplierId);
    expect(unpaid.some((i) => i.id === p1.id)).toBe(false);
    expect(unpaid.some((i) => i.id === p2.id)).toBe(true);
  }, 120000);

  it('payment idempotency — replay produces no duplicates', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, purchases, paymentsService, auth } = buildModules();

    const createdAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: createdAccount.id,
      signedAmountMinorUnits: '500000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: createdAccount.id,
      postedAt: new Date(), postedBy: actorId,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      { warehouseId, supplierId, purchaseDate: '2026-08-11', lines: [{ productId, quantity: '5', unitCost: { amount: '100.00', currency: 'PKR' } }], landedCosts: {} },
      auth,
    );
    await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'idem-post-1',
    );

    const pay1 = await paymentsService.postSupplierPayment(
      organizationId,
      { supplierId, accountId: createdAccount.id, amount: { amount: '200.00', currency: 'PKR' }, paymentDate: '2026-08-12', allocationMode: 'general' },
      { actorId },
      'idem-pay-1',
    );
    expect(pay1.statusCode).toBe(201);
    const paymentId = pay1.data.id;

    await ensureConnection();

    const pay2 = await paymentsService.postSupplierPayment(
      organizationId,
      { supplierId, accountId: createdAccount.id, amount: { amount: '200.00', currency: 'PKR' }, paymentDate: '2026-08-12', allocationMode: 'general' },
      { actorId },
      'idem-pay-1',
    );
    expect(pay2.data.id).toBe(paymentId);

    expect(await PaymentModel.countDocuments({ organizationId })).toBe(1);
    expect(await AccountMovementModel.countDocuments({ organizationId, sourceType: 'supplier_payment' })).toBe(1);
  }, 120000);

  it('cancel atomicity — rollback on simulated failure leaves purchase intact', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, inventory, purchases, auth } = buildModules();

    const createdAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: createdAccount.id,
      signedAmountMinorUnits: '500000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: createdAccount.id,
      postedAt: new Date(), postedBy: actorId,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      { warehouseId, supplierId, purchaseDate: '2026-08-11', lines: [{ productId, quantity: '3', unitCost: { amount: '100.00', currency: 'PKR' } }], landedCosts: {} },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'cancel-atomicity-post',
    );
    expect(posted.data.status).toBe('posted');

    const movementsBefore = await StockMovementModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });

    const originalOutbound = inventory.inventoryService.postOutboundIssueInSession.bind(inventory.inventoryService);
    let outboundCalls = 0;
    inventory.inventoryService.postOutboundIssueInSession = async (...args) => {
      outboundCalls += 1;
      if (outboundCalls === 1) {
        throw new Error('simulated outbound failure');
      }
      return originalOutbound(...args);
    };

    await expect(
      purchases.purchasesService.cancelPurchase(
        organizationId, posted.data.id,
        { expectedVersion: posted.data.version, reason: 'Forced fail' },
        auth,
        'cancel-rollback-1',
      ),
    ).rejects.toThrow(/simulated outbound failure/);

    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);

    const stillPosted = await PurchaseModel.findOne({ _id: posted.data.id }).lean().exec();
    expect(stillPosted.status).toBe('posted');

    inventory.inventoryService.postOutboundIssueInSession = originalOutbound;
  }, 120000);

  it('return atomicity — rollback on simulated failure leaves stock intact', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, inventory, purchases, returnsModule, paymentsService, auth } = buildModules();

    const createdAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: createdAccount.id,
      signedAmountMinorUnits: '500000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: createdAccount.id,
      postedAt: new Date(), postedBy: actorId,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      { warehouseId, supplierId, purchaseDate: '2026-08-11', lines: [{ productId, quantity: '5', unitCost: { amount: '100.00', currency: 'PKR' } }], landedCosts: {} },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'ret-atomicity-post',
    );
    expect(posted.data.status).toBe('posted');

    returnsModule.returnsService.purchasesService = {
      getPurchaseSourceForReturn: (orgId, purchaseId) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId),
    };

    const returnDraft = await returnsModule.returnsService.createPurchaseReturnDraft(
      organizationId, posted.data.id,
      { lines: [{ originalLineIndex: 0, quantity: '2' }] },
      auth,
    );

    const movementsBefore = await StockMovementModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });

    const originalOutbound = inventory.inventoryService.postOutboundIssueInSession.bind(inventory.inventoryService);
    let calls = 0;
    inventory.inventoryService.postOutboundIssueInSession = async (...args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('simulated return outbound failure');
      }
      return originalOutbound(...args);
    };

    await expect(
      returnsModule.returnsService.postReturn(
        organizationId, returnDraft.id,
        { expectedVersion: returnDraft.version, reason: 'Forced fail', resolution: 'ledger_adjustment' },
        auth,
        'ret-rollback-1',
      ),
    ).rejects.toThrow(/simulated return outbound failure/);

    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);

    const stillDraft = await ReturnModel.findOne({ _id: returnDraft.id }).lean().exec();
    expect(stillDraft.status).toBe('draft');

    inventory.inventoryService.postOutboundIssueInSession = originalOutbound;

    void paymentsService;
  }, 120000);

  it('concurrent returns cannot exceed returnable quantity', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, purchases, returnsModule, auth } = buildModules();

    const createdAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: createdAccount.id,
      signedAmountMinorUnits: '500000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: createdAccount.id,
      postedAt: new Date(), postedBy: actorId,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      { warehouseId, supplierId, purchaseDate: '2026-08-11', lines: [{ productId, quantity: '4', unitCost: { amount: '100.00', currency: 'PKR' } }], landedCosts: {} },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'concurrent-return-post',
    );

    returnsModule.returnsService.purchasesService = {
      getPurchaseSourceForReturn: (orgId, purchaseId) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId),
    };

    // Create two return drafts, each for 3 units (total 6 > 4)
    const draft1 = await returnsModule.returnsService.createPurchaseReturnDraft(
      organizationId, posted.data.id,
      { lines: [{ originalLineIndex: 0, quantity: '3' }] },
      auth,
    );
    const draft2 = await returnsModule.returnsService.createPurchaseReturnDraft(
      organizationId, posted.data.id,
      { lines: [{ originalLineIndex: 0, quantity: '3' }] },
      auth,
    );

    const [r1, r2] = await Promise.allSettled([
      returnsModule.returnsService.postReturn(
        organizationId, draft1.id,
        { expectedVersion: draft1.version, reason: 'Concurrent A', resolution: 'ledger_adjustment' },
        auth,
        'concurrent-return-a',
      ),
      returnsModule.returnsService.postReturn(
        organizationId, draft2.id,
        { expectedVersion: draft2.version, reason: 'Concurrent B', resolution: 'ledger_adjustment' },
        auth,
        'concurrent-return-b',
      ),
    ]);

    const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
    const failures = [r1, r2].filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const postedReturns = await ReturnModel.countDocuments({ organizationId, status: 'posted' });
    expect(postedReturns).toBe(1);

    const movements = await StockMovementModel.countDocuments({
      organizationId, sourceType: 'purchase_return',
    });
    expect(movements).toBe(1);
  }, 120000);

  it('supplier ledger reconciliation is healthy after full purchase+payment+return lifecycle', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, ledgers, purchases, returnsModule, paymentsService, auth } = buildModules();

    const createdAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: createdAccount.id,
      signedAmountMinorUnits: '1000000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: createdAccount.id,
      postedAt: new Date(), postedBy: actorId,
    });

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      { warehouseId, supplierId, purchaseDate: '2026-08-11', lines: [{ productId, quantity: '10', unitCost: { amount: '100.00', currency: 'PKR' } }], landedCosts: {} },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'reconcile-post',
    );
    expect(posted.data.purchaseTotal.amount).toBe('1000.00');

    await paymentsService.postSupplierPayment(
      organizationId,
      { supplierId, accountId: createdAccount.id, amount: { amount: '400.00', currency: 'PKR' }, paymentDate: '2026-08-12', allocationMode: 'general' },
      { actorId },
      'reconcile-pay',
    );

    returnsModule.returnsService.purchasesService = {
      getPurchaseSourceForReturn: (orgId, purchaseId) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId),
    };

    const returnDraft = await returnsModule.returnsService.createPurchaseReturnDraft(
      organizationId, posted.data.id,
      { lines: [{ originalLineIndex: 0, quantity: '2' }] },
      auth,
    );
    await returnsModule.returnsService.postReturn(
      organizationId, returnDraft.id,
      { expectedVersion: returnDraft.version, reason: 'Bad goods', resolution: 'ledger_adjustment' },
      auth,
      'reconcile-return',
    );

    const payable = await ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId);
    // 1000 (purchase) - 400 (payment) - 200 (return 2 × 100) = 400
    expect(payable.amount).toBe('400.00');

    expect(await PurchaseModel.countDocuments({ organizationId, status: 'posted' })).toBe(1);
    expect(await StockMovementModel.countDocuments({ organizationId, sourceType: 'purchase_return' })).toBe(1);
    expect(await LedgerEffectModel.countDocuments({ organizationId, sourceType: 'purchase_return' })).toBe(1);
  }, 120000);
});
