import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { createSupplierFinanceModule } = require('./supplier-finance.module');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { SupplierRefundModel, SupplierBalanceAdjustmentModel } = require('./persistence/supplier-finance.model');
const { LedgerEffectModel, SupplierFinancialVersionModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { PaymentAllocationModel } = require('../payments-ledgers/persistence/payment-allocation.model');
const { PaymentModel } = require('../payments-ledgers/persistence/payment.model');
const { AccountModel } = require('../accounts-expenses/persistence/account.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');
const { IdempotencyRecordModel } = require('../../platform/idempotency/persistence/idempotency-record.model');

async function replicaSetPrimary() {
  try { const hello = await mongoose.connection.db.admin().command({ hello: 1 }); return hello.setName === 'rs0' && hello.isWritablePrimary === true; } catch { return false; }
}

describe('supplier finance real-Mongo atomicity and concurrency', () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_supplier_finance_${Date.now()}`;
  let ready = false;
  beforeAll(async () => {
    const parsed = new URL(uri); parsed.pathname = `/${isolatedDb}`;
    try { await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 }); } catch { return; }
    ready = await replicaSetPrimary();
    if (!ready) { await mongoose.disconnect(); return; }
    await Promise.all([SupplierRefundModel, SupplierBalanceAdjustmentModel, LedgerEffectModel, SupplierFinancialVersionModel, PaymentAllocationModel, PaymentModel, AccountModel, AccountMovementModel, AuditEventModel, IdempotencyRecordModel].map((model) => model.syncIndexes()));
  }, 60000);
  afterAll(async () => { if (ready) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } });

  function build() {
    const organizationId = new mongoose.Types.ObjectId().toString(); const supplierId = new mongoose.Types.ObjectId().toString(); const actor = { actorId: new mongoose.Types.ObjectId().toString() };
    const suppliersService = { async getSupplier(org, id) { if (String(org) !== organizationId || String(id) !== supplierId) { const error = new Error('Supplier not found'); error.statusCode = 404; throw error; } return { id: supplierId, organizationId, status: 'active', openingBalance: null }; } };
    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    const accounts = createAccountsModule({ persistence: 'mongoose' });
    const holder = { service: null };
    const paymentsService = ledgers.createPaymentsService({ accountsService: accounts.accountsService, suppliersService, customersService: {}, listUnpaidSupplierPurchases: async () => [], listUnpaidCustomerSales: async () => [], listManualSupplierPayableTargets: (...args) => holder.service?.listManualPayableTargets(...args) ?? [], listSupplierPayableTargetAdjustments: (...args) => holder.service?.listPayableTargetAdjustments(...args) ?? [] });
    const finance = createSupplierFinanceModule({ persistence: 'mongoose', ledgersService: ledgers.ledgersService, accountsService: accounts.accountsService, suppliersService, paymentsService });
    holder.service = finance.supplierFinanceService;
    return { organizationId, supplierId, actor, ledgers, accounts, paymentsService, service: holder.service };
  }

  async function seedAdvance(f, amount) {
    await f.ledgers.ledgersService.postLedgerEffect(null, { organizationId: f.organizationId, partyType: 'supplier', supplierId: f.supplierId, effectKind: 'supplier_advance', signedAmountMinorUnits: amount, sourceType: 'supplier_opening_advance', sourceId: f.supplierId, postedAt: new Date(), postedBy: f.actor.actorId });
  }

  it('rolls back refund source and ledger effect when account posting fails', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Refund rollback', accountType: 'bank', bankName: 'HBL' }, f.actor); await seedAdvance(f, '10000');
    const original = f.accounts.accountsService.postAccountMovement;
    f.accounts.accountsService.postAccountMovement = async () => { throw new Error('forced account failure'); };
    await expect(f.service.postRefund(f.organizationId, { supplierId: f.supplierId, accountId: account.id, amount: { amount: '70.00' }, businessDate: '2026-09-24' }, f.actor, 'rollback')).rejects.toThrow('forced account failure');
    f.accounts.accountsService.postAccountMovement = original;
    expect(await SupplierRefundModel.countDocuments({ organizationId: f.organizationId })).toBe(0);
    expect(await LedgerEffectModel.countDocuments({ organizationId: f.organizationId, sourceType: 'supplier_advance_refund' })).toBe(0);
    expect(await AccountMovementModel.countDocuments({ organizationId: f.organizationId, sourceType: 'supplier_advance_refund' })).toBe(0);
  });

  it('serializes competing refunds so total cannot exceed available advance', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Refund concurrency', accountType: 'bank', bankName: 'HBL' }, f.actor); await seedAdvance(f, '10000');
    const body = { supplierId: f.supplierId, accountId: account.id, amount: { amount: '70.00' }, businessDate: '2026-09-24' };
    const results = await Promise.allSettled([f.service.postRefund(f.organizationId, body, f.actor, 'refund-a'), f.service.postRefund(f.organizationId, body, f.actor, 'refund-b')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await f.ledgers.ledgersService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('30.00');
    expect(await SupplierRefundModel.countDocuments({ organizationId: f.organizationId, status: 'posted' })).toBe(1);
    expect(await AccountMovementModel.countDocuments({ organizationId: f.organizationId, sourceType: 'supplier_advance_refund' })).toBe(1);
  });

  it('restores a manual payable target after Supplier Payment correction', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Manual payable correction', accountType: 'bank', bankName: 'HBL' }, f.actor);
    const adjustment = await f.service.adjustBalance(f.organizationId, { supplierId: f.supplierId, balanceType: 'supplier_payable', expectedCurrentBalance: { amount: '0.00' }, desiredBalance: { amount: '100.00' }, businessDate: '2026-09-24', reason: 'Reconciliation', category: 'manual' }, f.actor, 'adjust-payable');
    const holder = f.service;
    const paymentsService = f.ledgers.createPaymentsService({ accountsService: f.accounts.accountsService, suppliersService: { async getSupplier() { return { id: f.supplierId, status: 'active', openingBalance: null }; } }, customersService: {}, listUnpaidSupplierPurchases: async () => [], listUnpaidCustomerSales: async () => [], listManualSupplierPayableTargets: (...args) => holder.listManualPayableTargets(...args), listSupplierPayableTargetAdjustments: (...args) => holder.listPayableTargetAdjustments(...args) });
    const payment = await paymentsService.postSupplierPayment(f.organizationId, { supplierId: f.supplierId, accountId: account.id, amount: { amount: '40.00' }, paymentDate: '2026-09-24', allocationMode: 'general', notes: '' }, f.actor, 'payment');
    expect((await paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId))[0].outstandingMinorUnits).toBe('6000');
    await paymentsService.correctPayment(f.organizationId, payment.data.id, { reason: 'Wrong payment' }, f.actor, 'correct');
    expect((await paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId))[0].outstandingMinorUnits).toBe('10000');
    await expect(f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Restore' }, f.actor, 'reverse-adjustment')).resolves.toMatchObject({ data: { signedDeltaMinorUnits: '-10000' } });
  });

  it('serializes a refund racing with purchase advance consumption without negative advance', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Refund purchase race', accountType: 'bank', bankName: 'HBL' }, f.actor); await seedAdvance(f, '10000');
    const purchaseId = new mongoose.Types.ObjectId().toString();
    const purchaseWork = f.ledgers.transactionRunner.run(async (session) => {
      const available = BigInt((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId, session)).amount.replace('.', ''));
      const applied = available < 7000n ? available : 7000n;
      await f.paymentsService.postSupplierPayableEffect(session, { organizationId: f.organizationId, supplierId: f.supplierId, signedAmountMinorUnits: '7000', sourceType: 'purchase_payable', sourceId: purchaseId, postedAt: new Date(), postedBy: f.actor.actorId });
      if (applied > 0n) await f.paymentsService.applySupplierAdvanceInSession(session, { organizationId: f.organizationId, supplierId: f.supplierId, purchaseId, amountMinorUnits: applied.toString(), postedAt: new Date(), postedBy: f.actor.actorId });
      return applied;
    });
    const refundWork = f.service.postRefund(f.organizationId, { supplierId: f.supplierId, accountId: account.id, amount: { amount: '70.00' }, businessDate: '2026-09-24' }, f.actor, 'refund-race');
    const [purchaseResult, refundResult] = await Promise.allSettled([purchaseWork, refundWork]);
    expect(purchaseResult.status).toBe('fulfilled');
    const remaining = BigInt((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount.replace('.', ''));
    expect(remaining).toBeGreaterThanOrEqual(0n);
    if (refundResult.status === 'fulfilled') expect(remaining).toBe(0n);
    else expect(remaining).toBe(3000n);
  });
});
