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

  function buildModules(orgIdOverride, options = {}) {
    const organizationId = orgIdOverride ?? new mongoose.Types.ObjectId().toString();
    const supplierId = new mongoose.Types.ObjectId().toString();
    const secondSupplierId = new mongoose.Types.ObjectId().toString();
    const warehouseId = new mongoose.Types.ObjectId().toString();
    const secondWarehouseId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();

    const accounts = createAccountsModule({ persistence: 'mongoose' });

    const catalogService = {
      async getProduct() {
        return {
          id: productId,
          name: 'Seed',
          trackingMode: options.trackingMode ?? 'none',
          baseUnitCode: 'EA',
          status: 'active',
        };
      },
      async listPackagingUnits() {
        return { items: [] };
      },
    };
    const locationsService = {
      async getWarehouse(_orgId, id) {
        if (![warehouseId, secondWarehouseId].includes(String(id))) {
          const error = new Error('Warehouse not found');
          error.code = 'NOT_FOUND';
          throw error;
        }
        return { id: String(id), status: 'active', name: String(id) === warehouseId ? 'WH' : 'WH 2' };
      },
      async getBranch() {
        return { id: 'branch', status: 'active', name: 'Branch' };
      },
    };
    const suppliersService = {
      async getSupplier(orgId, id) {
        if (
          String(orgId) !== organizationId ||
          ![supplierId, secondSupplierId].includes(String(id))
        ) {
          const error = new Error('Supplier not found');
          error.code = 'NOT_FOUND';
          throw error;
        }
        return {
          id: String(id),
          status: 'active',
          name: String(id) === supplierId ? 'Supplier' : 'Supplier 2',
          ...(options.openingBalance ? { openingBalance: options.openingBalance } : {}),
        };
      },
    };

    const sharedIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    const ledgers = createLedgersModule({ persistence: 'mongoose' });

    const purchasesRef = {};
    const returnsRef = {};
    const paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      suppliersService,
      idempotency: sharedIdempotency,
      listUnpaidSupplierPurchases: (orgId, suppId, session) =>
        purchasesRef.purchases.purchasesService.listUnpaidSupplierPurchases(orgId, suppId, session),
    });

    const inventory = createInventoryModule({
      persistence: 'mongoose',
      catalogService,
      locationsService,
      canAccessWarehouse: () => true,
      hasPermission: () => true,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
    });

    purchasesRef.purchases = createPurchasesModule({
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
      listPurchaseReturnCredits: (orgId, purchaseId, session) =>
        returnsRef.returnsModule.listPurchaseReturnCredits(orgId, purchaseId, session),
      listPostedReturnsByPurchase: (orgId, purchaseId, session) =>
        returnsRef.returnsModule.listPostedReturnsByPurchase(orgId, purchaseId, session),
    });

    const returnsIdempotency = createIdempotencyService(createMongooseIdempotencyStore());
    returnsRef.returnsModule = createReturnsModule({
      persistence: 'mongoose',
      inventoryService: inventory.inventoryService,
      paymentsService,
      accountsService: accounts.accountsService,
      purchasesService: purchasesRef.purchases.purchasesService,
      canAccessWarehouse: () => true,
      idempotency: returnsIdempotency,
    });

    const purchases = purchasesRef.purchases;
    const returnsModule = returnsRef.returnsModule;

    const auth = {
      userId: actorId,
      organizationId,
      contextType: 'organization',
      role: 'Owner',
      permissions: ['purchases.create', 'purchases.post', 'purchases.view', 'purchases.cancel', 'purchases.return', 'returns.post'],
    };

    return {
      organizationId,
      supplierId,
      secondSupplierId,
      warehouseId,
      secondWarehouseId,
      productId,
      actorId,
      accounts,
      ledgers,
      inventory,
      purchases,
      returnsModule,
      paymentsService,
      auth,
    };
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

  it('persists opening-payable allocation and supplier advance consumption/restoration transactionally', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const modules = buildModules(undefined, {
      openingBalance: {
        kind: 'payable',
        amount: { amount: '100.00', currency: 'PKR' },
        ledgerEffectId: new mongoose.Types.ObjectId().toString(),
        status: 'posted',
      },
    });
    const {
      organizationId,
      supplierId,
      warehouseId,
      productId,
      actorId,
      accounts,
      ledgers,
      purchases,
      paymentsService,
      auth,
    } = modules;

    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId,
      partyType: 'supplier',
      supplierId,
      effectKind: 'payable',
      signedAmountMinorUnits: '10000',
      currency: 'PKR',
      sourceType: 'supplier_opening_payable',
      sourceId: supplierId,
      postedAt: new Date(),
      postedBy: actorId,
    });

    const account = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'Advance Cash', accountType: 'cash' },
      { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId,
      accountId: account.id,
      signedAmountMinorUnits: '100000',
      currency: 'PKR',
      sourceType: 'account_opening',
      sourceId: account.id,
      postedAt: new Date(),
      postedBy: actorId,
    });

    const payment = await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId,
        accountId: account.id,
        amount: { amount: '120.00', currency: 'PKR' },
        paymentDate: '2026-09-22',
        allocationMode: 'general',
      },
      { actorId },
      'mongo-opening-payable-payment',
    );
    expect(payment.data.allocations).toContainEqual(
      expect.objectContaining({
        targetType: 'supplier_opening_payable',
        targetId: supplierId,
        allocatedAmountMinorUnits: '10000',
      }),
    );
    expect(await PaymentAllocationModel.countDocuments({
      organizationId,
      targetType: 'supplier_opening_payable',
      targetId: supplierId,
    })).toBe(1);

    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId,
        supplierId,
        purchaseDate: '2026-09-22',
        lines: [
          {
            productId,
            quantity: '1',
            unitCost: { amount: '15.00', currency: 'PKR' },
          },
        ],
        landedCosts: {},
      },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId,
      draft.id,
      { expectedVersion: draft.version, payments: [] },
      auth,
      'mongo-advance-purchase-post',
    );
    expect(posted.data.payableTotal.amount).toBe('0.00');
    expect(await LedgerEffectModel.countDocuments({
      organizationId,
      sourceId: draft.id,
      sourceType: { $in: ['supplier_advance_application', 'supplier_advance_consumption'] },
    })).toBe(2);

    const cancelBody = {
      expectedVersion: posted.data.version,
      reason: 'Mongo advance restoration proof',
    };
    const cancelled = await purchases.purchasesService.cancelPurchase(
      organizationId,
      draft.id,
      cancelBody,
      auth,
      'mongo-advance-purchase-cancel',
    );
    const replay = await purchases.purchasesService.cancelPurchase(
      organizationId,
      draft.id,
      cancelBody,
      auth,
      'mongo-advance-purchase-cancel',
    );
    expect(replay.data.id).toBe(cancelled.data.id);
    expect(await LedgerEffectModel.countDocuments({
      organizationId,
      sourceId: draft.id,
      sourceType: 'purchase_cancellation_advance_reinstatement',
    })).toBe(1);
    expect((await ledgers.ledgersService.sumSupplierAdvance(organizationId, supplierId)).amount).toBe('20.00');
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
      getPurchaseSourceForReturn: (orgId, purchaseId, session) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId, session),
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
    await expect(
      purchases.purchasesService.correctPurchase(
        organizationId,
        posted.data.id,
        {
          expectedVersion: posted.data.version,
          correctionReason: 'Must not double-reverse returned stock',
          correctedPurchase: {
            warehouseId, supplierId, purchaseDate: '2026-08-11',
            lines: [{ productId, quantity: '2', unitCost: { amount: '100.00', currency: 'PKR' } }],
            landedCosts: {}, payments: [],
          },
        },
        auth,
        'correction-after-return',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
      getPurchaseSourceForReturn: (orgId, purchaseId, session) =>
        purchases.purchasesService.getPurchaseSourceForReturn(orgId, purchaseId, session),
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

  it('atomically corrects a posted purchase through cancellation plus normal replacement posting', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');
    await ensureConnection();
    const { organizationId, supplierId, warehouseId, productId, actorId, accounts, ledgers, purchases, auth } = buildModules();
    const originalAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'HBL', accountType: 'bank', bankName: 'HBL' }, { actorId },
    );
    const replacementAccount = await accounts.accountsService.createAccount(
      organizationId, { name: 'Meezan', accountType: 'bank', bankName: 'Meezan' }, { actorId },
    );
    for (const account of [originalAccount, replacementAccount]) {
      await accounts.accountsService.postAccountMovement(null, {
        organizationId, accountId: account.id, signedAmountMinorUnits: '1000000', currency: 'PKR',
        sourceType: 'account_opening', sourceId: account.id, postedAt: new Date(), postedBy: actorId,
      });
    }
    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId, supplierId, purchaseDate: '2026-09-27', supplierInvoiceReference: 'ORIGINAL-1',
        lines: [{ productId, quantity: '100', unitCost: { amount: '5.00', currency: 'PKR' } }],
        landedCosts: { freight: { amount: '100.00', currency: 'PKR' } },
      },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id,
      { expectedVersion: draft.version, payments: [{ accountId: originalAccount.id, amount: { amount: '200.00', currency: 'PKR' } }] },
      auth, 'purchase-correction-original-post',
    );
    const originalSnapshot = await PurchaseModel.findById(draft.id).lean().exec();
    const correctionBody = {
      expectedVersion: posted.data.version,
      correctionReason: 'Quantity and settlement account were entered incorrectly',
      correctedPurchase: {
        warehouseId, supplierId, purchaseDate: '2026-09-27', supplierInvoiceReference: 'CORRECTED-1',
        notes: 'Corrected copy',
        lines: [{ productId, quantity: '80', unitCost: { amount: '4.50', currency: 'PKR' } }],
        landedCosts: {},
        payments: [{ accountId: replacementAccount.id, amount: { amount: '80.00', currency: 'PKR' } }],
      },
    };
    const corrected = await purchases.purchasesService.correctPurchase(
      organizationId, draft.id, correctionBody, auth, 'purchase-correction-1',
    );
    const replay = await purchases.purchasesService.correctPurchase(
      organizationId, draft.id, correctionBody, auth, 'purchase-correction-1',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.replacementPurchase.id).toBe(corrected.data.replacementPurchase.id);
    expect(corrected.data.originalPurchase).toMatchObject({
      id: draft.id, status: 'cancelled', correctionStatus: 'corrected',
      replacementPurchaseId: corrected.data.replacementPurchase.id,
    });
    expect(corrected.data.replacementPurchase).toMatchObject({
      status: 'posted', correctionStatus: 'replacement', originalPurchaseId: draft.id,
    });
    expect(corrected.data.replacementPurchase.purchaseTotal.amount).toBe('360.00');
    const reloadedOriginal = await purchases.purchasesService.getPurchase(organizationId, draft.id, auth);
    expect(reloadedOriginal.replacementPurchaseId).toBe(corrected.data.replacementPurchase.id);
    expect(reloadedOriginal.correctionReason).toBe(correctionBody.correctionReason);
    const persistedOriginal = await PurchaseModel.findById(draft.id).lean().exec();
    expect(persistedOriginal.lines).toEqual(originalSnapshot.lines);
    expect(persistedOriginal.purchaseTotalMinorUnits).toBe(originalSnapshot.purchaseTotalMinorUnits);

    const movements = await StockMovementModel.find({ organizationId, productId }).lean().exec();
    expect(movements.reduce(
      (sum, item) => sum + (item.direction === 'inbound' ? 1n : -1n) * BigInt(item.quantityBaseMinorUnits),
      0n,
    )).toBe(800000n);
    expect(movements.reduce(
      (sum, item) => sum + (item.direction === 'inbound' ? 1n : -1n) * BigInt(item.inventoryValueMinorUnits),
      0n,
    )).toBe(36000n);
    expect((await ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId)).amount).toBe('280.00');

    const hbl = await AccountMovementModel.find({ organizationId, accountId: originalAccount.id }).lean().exec();
    const meezan = await AccountMovementModel.find({ organizationId, accountId: replacementAccount.id }).lean().exec();
    expect(hbl.reduce((sum, item) => sum + BigInt(item.signedAmountMinorUnits), 0n)).toBe(1000000n);
    expect(meezan.reduce((sum, item) => sum + BigInt(item.signedAmountMinorUnits), 0n)).toBe(992000n);
    await expect(
      purchases.purchasesService.correctPurchase(
        organizationId, draft.id, { ...correctionBody, correctionReason: 'Changed payload' }, auth, 'purchase-correction-1',
      ),
    ).rejects.toMatchObject({ name: 'IdempotencyConflictError' });
    await expect(
      purchases.purchasesService.correctPurchase(
        organizationId, draft.id, correctionBody, auth, 'purchase-correction-duplicate',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  }, 120000);

  it('blocks correction when external Supplier Payments or consumed stock depend on the original', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');
    await ensureConnection();
    const {
      organizationId, supplierId, warehouseId, productId, actorId,
      accounts, inventory, purchases, paymentsService, auth,
    } = buildModules();
    const account = await accounts.accountsService.createAccount(
      organizationId, { name: 'Dependency cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: account.id, signedAmountMinorUnits: '1000000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: account.id, postedAt: new Date(), postedBy: actorId,
    });
    const makePosted = async (suffix) => {
      const draft = await purchases.purchasesService.createPurchaseDraft(
        organizationId,
        {
          warehouseId, supplierId, purchaseDate: '2026-09-27',
          lines: [{ productId, quantity: '10', unitCost: { amount: '10.00', currency: 'PKR' } }],
          landedCosts: {}, notes: suffix,
        },
        auth,
      );
      return purchases.purchasesService.postPurchase(
        organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, `dependency-post-${suffix}`,
      );
    };
    const correctionBodyFor = (posted, suffix) => ({
      expectedVersion: posted.data.version,
      correctionReason: `Correct ${suffix}`,
      correctedPurchase: {
        warehouseId, supplierId, purchaseDate: '2026-09-27',
        lines: [{ productId, quantity: '8', unitCost: { amount: '10.00', currency: 'PKR' } }],
        landedCosts: {}, payments: [], notes: suffix,
      },
    });

    const paymentDependent = await makePosted('payment');
    await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId, accountId: account.id, amount: { amount: '20.00', currency: 'PKR' },
        paymentDate: '2026-09-27', allocationMode: 'invoice_specific',
        allocations: [{ purchaseId: paymentDependent.data.id, amount: { amount: '20.00', currency: 'PKR' } }],
      },
      { actorId },
      'external-payment-dependency',
    );
    await expect(
      purchases.purchasesService.correctPurchase(
        organizationId, paymentDependent.data.id, correctionBodyFor(paymentDependent, 'payment'), auth, 'blocked-payment-correction',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await PurchaseModel.findById(paymentDependent.data.id).lean().exec()).status).toBe('posted');

    const stockDependent = await makePosted('stock');
    await inventory.inventoryService.postOutboundIssueInSession(
      null,
      organizationId,
      { actorId },
      {
        warehouseId, productId, batchId: null,
        quantityBaseMinorUnits: '110000', enteredQuantityMinorUnits: '110000',
        unitCode: 'EA', conversionFactorSnapshot: '1', packagingUnitId: null,
        sourceType: 'sale', sourceId: new mongoose.Types.ObjectId().toString(),
        reason: 'Downstream sale', postedAt: new Date(),
      },
    );
    await expect(
      purchases.purchasesService.correctPurchase(
        organizationId, stockDependent.data.id, correctionBodyFor(stockDependent, 'stock'), auth, 'blocked-stock-correction',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await PurchaseModel.findById(stockDependent.data.id).lean().exec()).status).toBe('posted');

    const racePurchase = await makePosted('payment-race');
    const originalOutbound = inventory.inventoryService.postOutboundIssueInSession.bind(
      inventory.inventoryService,
    );
    let releaseCorrection;
    let correctionReachedReversal;
    const reversalReached = new Promise((resolve) => {
      correctionReachedReversal = resolve;
    });
    const correctionRelease = new Promise((resolve) => {
      releaseCorrection = resolve;
    });
    let pauseOnce = true;
    inventory.inventoryService.postOutboundIssueInSession = async (...args) => {
      if (pauseOnce && args[3]?.sourceType === 'purchase_cancellation') {
        pauseOnce = false;
        correctionReachedReversal();
        await correctionRelease;
      }
      return originalOutbound(...args);
    };
    const correctionAttempt = purchases.purchasesService.correctPurchase(
      organizationId,
      racePurchase.data.id,
      correctionBodyFor(racePurchase, 'payment-race'),
      auth,
      'payment-race-correction',
    );
    await reversalReached;
    const racingPayment = await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId, accountId: account.id, amount: { amount: '10.00', currency: 'PKR' },
        paymentDate: '2026-09-27', allocationMode: 'invoice_specific',
        allocations: [{ purchaseId: racePurchase.data.id, amount: { amount: '10.00', currency: 'PKR' } }],
      },
      { actorId },
      'racing-external-payment',
    );
    expect(racingPayment.data.status).toBe('posted');
    releaseCorrection();
    await expect(correctionAttempt).rejects.toMatchObject({ code: 'CONFLICT' });
    inventory.inventoryService.postOutboundIssueInSession = originalOutbound;
    expect((await PurchaseModel.findById(racePurchase.data.id).lean().exec()).status).toBe('posted');
  }, 120000);

  it('corrects batch, warehouse, supplier, landed cost, and Advance funding through normal engines', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');
    await ensureConnection();
    const {
      organizationId, supplierId, secondSupplierId, warehouseId, secondWarehouseId,
      productId, actorId, accounts, ledgers, purchases, paymentsService, auth,
    } = buildModules(undefined, { trackingMode: 'batch_expiry' });
    const account = await accounts.accountsService.createAccount(
      organizationId, { name: 'Advance cash', accountType: 'cash' }, { actorId },
    );
    await accounts.accountsService.postAccountMovement(null, {
      organizationId, accountId: account.id, signedAmountMinorUnits: '1000000', currency: 'PKR',
      sourceType: 'account_opening', sourceId: account.id, postedAt: new Date(), postedBy: actorId,
    });
    await paymentsService.postSupplierPayment(
      organizationId,
      {
        supplierId, accountId: account.id, amount: { amount: '120.00', currency: 'PKR' },
        paymentDate: '2026-09-26', allocationMode: 'general',
      },
      { actorId },
      'correction-advance-seed',
    );
    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId, supplierId, purchaseDate: '2026-09-27',
        lines: [{
          productId, quantity: '10', unitCost: { amount: '10.00', currency: 'PKR' },
          batchNumber: 'BATCH-CORR', manufacturingDate: '2026-09-01', expiryDate: '2027-09-01',
        }],
        landedCosts: { freight: { amount: '20.00', currency: 'PKR' } },
      },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'correction-advance-post',
    );
    expect(posted.data.payableTotal.amount).toBe('0.00');
    const corrected = await purchases.purchasesService.correctPurchase(
      organizationId,
      draft.id,
      {
        expectedVersion: posted.data.version,
        correctionReason: 'Wrong supplier, warehouse and batch receipt facts',
        correctedPurchase: {
          warehouseId: secondWarehouseId, supplierId: secondSupplierId, purchaseDate: '2026-09-27',
          lines: [{
            productId, quantity: '8', unitCost: { amount: '9.00', currency: 'PKR' },
            batchNumber: 'BATCH-CORR', manufacturingDate: '2026-09-01', expiryDate: '2027-09-01',
          }],
          landedCosts: { freight: { amount: '8.00', currency: 'PKR' } },
          payments: [],
        },
      },
      auth,
      'correction-advance-correct',
    );
    expect(corrected.data.replacementPurchase).toMatchObject({
      supplierId: secondSupplierId,
      warehouseId: secondWarehouseId,
    });
    expect(corrected.data.replacementPurchase.purchaseTotal.amount).toBe('80.00');
    expect(corrected.data.replacementPurchase.lines[0]).toMatchObject({
      batchNumber: 'BATCH-CORR',
      quantity: '8.0000',
    });
    expect((await paymentsService.sumSupplierAdvance(organizationId, supplierId)).amount).toBe('120.00');
    expect((await ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId)).amount).toBe('0.00');
    expect((await ledgers.ledgersService.sumSupplierPayable(organizationId, secondSupplierId)).amount).toBe('80.00');
    const originalWarehouseMovements = await StockMovementModel.find({
      organizationId, warehouseId, productId,
    }).lean().exec();
    const replacementWarehouseMovements = await StockMovementModel.find({
      organizationId, warehouseId: secondWarehouseId, productId,
    }).lean().exec();
    expect(originalWarehouseMovements.reduce(
      (sum, item) => sum + (item.direction === 'inbound' ? 1n : -1n) * BigInt(item.quantityBaseMinorUnits),
      0n,
    )).toBe(0n);
    expect(replacementWarehouseMovements.reduce(
      (sum, item) => sum + (item.direction === 'inbound' ? 1n : -1n) * BigInt(item.quantityBaseMinorUnits),
      0n,
    )).toBe(80000n);
  }, 120000);

  it('serializes concurrent corrections and preserves tenant and Customer-accounting isolation', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');
    await ensureConnection();
    const { organizationId, supplierId, warehouseId, productId, purchases, auth } = buildModules();
    const draft = await purchases.purchasesService.createPurchaseDraft(
      organizationId,
      {
        warehouseId, supplierId, purchaseDate: '2026-09-27',
        lines: [{ productId, quantity: '5', unitCost: { amount: '20.00', currency: 'PKR' } }],
        landedCosts: {},
      },
      auth,
    );
    const posted = await purchases.purchasesService.postPurchase(
      organizationId, draft.id, { expectedVersion: draft.version, payments: [] }, auth, 'concurrent-correction-post',
    );
    const correctionBody = {
      expectedVersion: posted.data.version,
      correctionReason: 'Concurrent correction proof',
      correctedPurchase: {
        warehouseId, supplierId, purchaseDate: '2026-09-27',
        lines: [{ productId, quantity: '4', unitCost: { amount: '20.00', currency: 'PKR' } }],
        landedCosts: {}, payments: [],
      },
    };
    await expect(
      purchases.purchasesService.correctPurchase(
        new mongoose.Types.ObjectId().toString(), draft.id, correctionBody, auth, 'cross-tenant-correction',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const results = await Promise.allSettled([
      purchases.purchasesService.correctPurchase(
        organizationId, draft.id, correctionBody, auth, 'concurrent-correction-a',
      ),
      purchases.purchasesService.correctPurchase(
        organizationId, draft.id, correctionBody, auth, 'concurrent-correction-b',
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await PurchaseModel.countDocuments({ organizationId, originalPurchaseId: draft.id })).toBe(1);
    expect(await LedgerEffectModel.countDocuments({ organizationId, partyType: 'customer' })).toBe(0);
  }, 120000);
});
