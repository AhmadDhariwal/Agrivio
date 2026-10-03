import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createIsolatedTestDatabaseName, resolveMongoTestUri } from '@agrivio/test-support';
import { PaymentModel } from './persistence/payment.model';
import { PaymentAllocationModel } from './persistence/payment-allocation.model';
import { LedgerEffectModel } from './persistence/ledger-effect.model';
import { AccountModel } from '../accounts-expenses/persistence/account.model';
import { AccountMovementModel } from '../accounts-expenses/persistence/account-movement.model';
import { IdempotencyRecordModel } from '../../platform/idempotency/persistence/idempotency-record.model';
import { createAccountsModule } from '../accounts-expenses/accounts.module';
import { createLedgersModule } from './ledgers.module';

describe('Payment correction real-Mongo allocation integration', () => {
  const databaseName = createIsolatedTestDatabaseName('payment_correction');
  const customerOpenings = new Map();
  const supplierOpenings = new Map();
  const customerTargets = new Map();
  const supplierTargets = new Map();
  const customerManualTargets = new Map();
  const supplierManualTargets = new Map();
  let mongoReady = false;
  let organizationId;
  let accountId;
  let actorId;
  let ledgers;
  let paymentsService;

  const actor = () => ({ actorId });
  const objectId = () => new mongoose.Types.ObjectId().toString();
  const money = (amount) => ({ amount, currency: 'PKR' });
  const targetKey = (partyId, id) => `${partyId}:${id}`;

  async function outstandingTargets(source, partyId, targetType, session) {
    const result = [];
    for (const [key, target] of source.entries()) {
      if (!key.startsWith(`${partyId}:`)) continue;
      const allocations = await ledgers.paymentsStore.listAllocationsByTarget(
        organizationId,
        targetType,
        target.id,
        session,
      );
      const allocated = allocations.reduce(
        (sum, item) => sum + BigInt(item.allocatedAmountMinorUnits),
        0n,
      );
      const outstanding = BigInt(target.baseMinorUnits) - allocated;
      if (outstanding > 0n) result.push({ ...target, outstandingMinorUnits: outstanding.toString() });
    }
    return result;
  }

  beforeAll(async () => {
    const uri = new URL(resolveMongoTestUri());
    uri.pathname = `/${databaseName}`;
    try {
      await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      mongoReady = hello.setName === 'rs0' && hello.isWritablePrimary === true;
    } catch {
      mongoReady = false;
    }
    if (!mongoReady) {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      return;
    }
    await Promise.all([
      PaymentModel.syncIndexes(),
      PaymentAllocationModel.syncIndexes(),
      LedgerEffectModel.syncIndexes(),
      AccountModel.syncIndexes(),
      AccountMovementModel.syncIndexes(),
      IdempotencyRecordModel.syncIndexes(),
    ]);
    organizationId = objectId();
    actorId = objectId();
    const accounts = createAccountsModule({ persistence: 'mongoose' });
    accountId = (await accounts.accountsService.createAccount(
      organizationId,
      { name: 'Correction integration cash', accountType: 'cash' },
      actor(),
    )).id;
    ledgers = createLedgersModule({ persistence: 'mongoose', accountsService: accounts.accountsService });
    paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      customersService: {
        async getCustomer(orgId, id) {
          if (String(orgId) !== organizationId) throw new Error('not found');
          return { id, status: 'active', openingBalance: customerOpenings.get(String(id)) ?? null };
        },
        async listCustomerSummariesByIds(_orgId, ids) {
          return ids.map((id) => ({ id, name: `Customer ${id}`, phone: null }));
        },
      },
      suppliersService: {
        async getSupplier(orgId, id) {
          if (String(orgId) !== organizationId) throw new Error('not found');
          return { id, status: 'active', openingBalance: supplierOpenings.get(String(id)) ?? null };
        },
      },
      listUnpaidCustomerSales: (_orgId, customerId, session) =>
        outstandingTargets(customerTargets, customerId, 'sale', session),
      listUnpaidSupplierPurchases: (_orgId, supplierId, session) =>
        outstandingTargets(supplierTargets, supplierId, 'purchase', session),
      listManualCustomerReceivableTargets: async (_orgId, customerId) =>
        [...customerManualTargets.entries()]
          .filter(([key]) => key.startsWith(`${customerId}:`))
          .map(([, item]) => ({ ...item, outstandingMinorUnits: item.baseMinorUnits })),
      listManualSupplierPayableTargets: async (_orgId, supplierId) =>
        [...supplierManualTargets.entries()]
          .filter(([key]) => key.startsWith(`${supplierId}:`))
          .map(([, item]) => ({ ...item, outstandingMinorUnits: item.baseMinorUnits })),
      listCustomerTradeTargetAdjustments: async () => [],
      listSupplierPayableTargetAdjustments: async () => [],
    });
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  function requireMongo(skip) {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');
  }

  function postCustomer(customerId, amount, mode = 'general', allocations) {
    return paymentsService.postCustomerPayment(
      organizationId,
      { customerId, accountId, amount: money(amount), paymentDate: '2026-09-26', allocationMode: mode, ...(allocations ? { allocations } : {}) },
      actor(),
      objectId(),
    );
  }

  function postSupplier(supplierId, amount, mode = 'general', allocations) {
    return paymentsService.postSupplierPayment(
      organizationId,
      { supplierId, accountId, amount: money(amount), paymentDate: '2026-09-26', allocationMode: mode, ...(allocations ? { allocations } : {}) },
      actor(),
      objectId(),
    );
  }

  function correct(paymentId, replacement, key = objectId()) {
    return paymentsService.correctPayment(
      organizationId,
      paymentId,
      { reason: 'Correct allocation', replacement },
      actor(),
      key,
    );
  }

  it('customer replacement sees reversal writes from the same transaction', async ({ skip }) => {
    requireMongo(skip);
    const customerId = objectId();
    const saleId = objectId();
    customerTargets.set(targetKey(customerId, saleId), {
      id: saleId, invoiceNumber: 'C-SESSION', invoiceDate: '2026-09-01', sequence: '1', baseMinorUnits: '10000',
    });
    const original = await postCustomer(customerId, '100.00', 'invoice_specific', [{ saleId, amount: money('100.00') }]);
    const corrected = await correct(original.data.id, {
      accountId, amount: money('100.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ saleId, amount: money('100.00') }],
    });
    expect(corrected.data.replacement.allocations).toEqual(
      expect.arrayContaining([expect.objectContaining({ targetType: 'sale', targetId: saleId })]),
    );
    expect(corrected.data.replacement.allocations.some((item) => item.targetType === 'customer_advance')).toBe(false);
  });

  it('supports customer opening, general FIFO, and invoice-specific replacements', async ({ skip }) => {
    requireMongo(skip);
    const openingCustomer = objectId();
    customerOpenings.set(openingCustomer, { kind: 'receivable', ledgerEffectId: objectId(), amount: money('80.00') });
    const openingOriginal = await postCustomer(openingCustomer, '80.00');
    const openingCorrected = await correct(openingOriginal.data.id, {
      accountId, amount: money('80.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ saleId: `opening:${openingCustomer}`, amount: money('80.00') }],
    });
    expect(openingCorrected.data.replacement.allocations[0].targetType).toBe('customer_opening_receivable');

    const fifoCustomer = objectId();
    const first = objectId();
    const second = objectId();
    customerTargets.set(targetKey(fifoCustomer, first), { id: first, invoiceNumber: 'FIFO-1', invoiceDate: '2026-08-01', sequence: '1', baseMinorUnits: '5000' });
    customerTargets.set(targetKey(fifoCustomer, second), { id: second, invoiceNumber: 'FIFO-2', invoiceDate: '2026-08-02', sequence: '2', baseMinorUnits: '5000' });
    const fifoOriginal = await postCustomer(fifoCustomer, '60.00');
    const fifoCorrected = await correct(fifoOriginal.data.id, {
      accountId, amount: money('60.00'), paymentDate: '2026-09-27', allocationMode: 'general',
    });
    expect(fifoCorrected.data.replacement.allocations.slice(0, 2).map((item) => item.targetId)).toEqual([first, second]);
  });

  it('rejects customer invalid, over-allocated, and duplicate targets', async ({ skip }) => {
    requireMongo(skip);
    const customerId = objectId();
    const saleId = objectId();
    customerTargets.set(targetKey(customerId, saleId), { id: saleId, invoiceNumber: 'C-VALID', invoiceDate: '2026-09-01', sequence: '1', baseMinorUnits: '10000' });
    const original = await postCustomer(customerId, '50.00');
    const replacement = (allocations) => ({ accountId, amount: money('50.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations });
    await expect(correct(original.data.id, replacement([{ saleId: objectId(), amount: money('50.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(correct(original.data.id, replacement([{ saleId, amount: money('101.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(correct(original.data.id, replacement([{ saleId, amount: money('25.00') }, { saleId, amount: money('25.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('supports supplier invoice, opening, manual, and return-adjusted replacements', async ({ skip }) => {
    requireMongo(skip);
    const supplierId = objectId();
    const purchaseId = objectId();
    supplierTargets.set(targetKey(supplierId, purchaseId), { id: purchaseId, purchaseDate: '2026-09-01', sequence: '1', baseMinorUnits: '10000' });
    const invoiceOriginal = await postSupplier(supplierId, '100.00', 'invoice_specific', [{ purchaseId, amount: money('100.00') }]);
    const invoiceCorrected = await correct(invoiceOriginal.data.id, { accountId, amount: money('100.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ purchaseId, amount: money('100.00') }] });
    expect(invoiceCorrected.data.replacement.allocations[0].targetType).toBe('purchase');

    const openingSupplier = objectId();
    supplierOpenings.set(openingSupplier, { kind: 'payable', ledgerEffectId: objectId(), amount: money('70.00') });
    const openingOriginal = await postSupplier(openingSupplier, '70.00');
    const openingCorrected = await correct(openingOriginal.data.id, { accountId, amount: money('70.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ purchaseId: `opening:${openingSupplier}`, amount: money('70.00') }] });
    expect(openingCorrected.data.replacement.allocations[0].targetType).toBe('supplier_opening_payable');

    const manualSupplier = objectId();
    const manualId = objectId();
    supplierManualTargets.set(targetKey(manualSupplier, manualId), { id: manualId, targetId: manualId, targetType: 'supplier_manual_payable', purchaseDate: '2026-09-01', sequence: 'manual', baseMinorUnits: '6000' });
    const manualOriginal = await postSupplier(manualSupplier, '60.00', 'invoice_specific', [{ purchaseId: manualId, amount: money('60.00') }]);
    const manualCorrected = await correct(manualOriginal.data.id, { accountId, amount: money('60.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ purchaseId: manualId, amount: money('60.00') }] });
    expect(manualCorrected.data.replacement.allocations[0].targetType).toBe('supplier_manual_payable');

    const returnSupplier = objectId();
    const returnedPurchase = objectId();
    supplierTargets.set(targetKey(returnSupplier, returnedPurchase), { id: returnedPurchase, purchaseDate: '2026-09-01', sequence: 'return-net', baseMinorUnits: '6000' });
    const returnOriginal = await postSupplier(returnSupplier, '60.00', 'invoice_specific', [{ purchaseId: returnedPurchase, amount: money('60.00') }]);
    const returnCorrected = await correct(returnOriginal.data.id, { accountId, amount: money('60.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations: [{ purchaseId: returnedPurchase, amount: money('60.00') }] });
    expect(returnCorrected.data.replacement.amount.amount).toBe('60.00');
  });

  it('rejects supplier invalid, over-allocated, and duplicate targets', async ({ skip }) => {
    requireMongo(skip);
    const supplierId = objectId();
    const purchaseId = objectId();
    supplierTargets.set(targetKey(supplierId, purchaseId), { id: purchaseId, purchaseDate: '2026-09-01', sequence: 'valid', baseMinorUnits: '10000' });
    const original = await postSupplier(supplierId, '50.00');
    const replacement = (allocations) => ({ accountId, amount: money('50.00'), paymentDate: '2026-09-27', allocationMode: 'invoice_specific', allocations });
    await expect(correct(original.data.id, replacement([{ purchaseId: objectId(), amount: money('50.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(correct(original.data.id, replacement([{ purchaseId, amount: money('101.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(correct(original.data.id, replacement([{ purchaseId, amount: money('25.00') }, { purchaseId, amount: money('25.00') }]))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('derives lineage after reload and replays the same idempotency key', async ({ skip }) => {
    requireMongo(skip);
    const customerId = objectId();
    const original = await postCustomer(customerId, '25.00');
    const key = objectId();
    const replacement = { accountId, amount: money('25.00'), paymentDate: '2026-09-27', allocationMode: 'general' };
    const first = await correct(original.data.id, replacement, key);
    const retry = await correct(original.data.id, replacement, key);
    expect(retry.replay).toBe(true);
    expect(retry.data.reversal.id).toBe(first.data.reversal.id);
    const detail = await paymentsService.getCustomerPayment(organizationId, original.data.id);
    expect(detail).toMatchObject({ reversalPaymentId: first.data.reversal.id, replacementPaymentId: first.data.replacement.id, correctionStatus: 'corrected' });
    const page = await paymentsService.listCustomerPayments(organizationId, { skip: 0, pageSize: 50 });
    expect(page.items.find((item) => item.id === original.data.id)).toMatchObject({ correctionStatus: 'corrected' });
  });
});
