import { describe, expect, it } from 'vitest';
import ledgersModule from '../payments-ledgers/ledgers.module';
import supplierFinanceModule from './supplier-finance.module';

const { createLedgersModule } = ledgersModule;
const { createSupplierFinanceModule } = supplierFinanceModule;

function fixture() {
  const organizationId = 'org-a'; const supplierId = 'supplier-a'; const accountId = 'account-a'; const actor = { actorId: 'user-a' };
  const movements = [];
  const suppliersService = {
    async getSupplier(org, id) {
      if (org !== organizationId || id !== supplierId) { const error = new Error('Supplier not found'); error.code = 'NOT_FOUND'; throw error; }
      return { id, organizationId: org, status: 'active', openingBalance: null };
    },
  };
  const accountsService = {
    async getAccount(org, id) {
      if (org !== organizationId || id !== accountId) { const error = new Error('Account not found'); error.code = 'NOT_FOUND'; throw error; }
      return { id, organizationId: org, status: 'active' };
    },
    async postAccountMovement(_session, input) { const row = { id: `movement-${movements.length + 1}`, ...input, status: 'posted' }; movements.push(row); return row; },
    async listAccountMovementsBySource(org, sourceType, sourceId) { return movements.filter((row) => row.organizationId === org && row.sourceType === sourceType && String(row.sourceId) === String(sourceId)); },
  };
  const purchases = [];
  const ledgers = createLedgersModule({ persistence: 'memory' });
  let financeService = null;
  const paymentsService = ledgers.createPaymentsService({
    accountsService,
    suppliersService,
    customersService: {},
    listUnpaidSupplierPurchases: async () => purchases.map((row) => ({ ...row })),
    listUnpaidCustomerSales: async () => [],
    listManualSupplierPayableTargets: (...args) => financeService?.listManualPayableTargets(...args) ?? [],
    listSupplierPayableTargetAdjustments: (...args) => financeService?.listPayableTargetAdjustments(...args) ?? [],
  });
  const finance = createSupplierFinanceModule({ persistence: 'memory', ledgersService: ledgers.ledgersService, accountsService, suppliersService, paymentsService });
  financeService = finance.supplierFinanceService;
  const refundBody = (amount) => ({ supplierId, accountId, amount: { amount, currency: 'PKR' }, businessDate: '2026-09-24', reference: 'RF-1' });
  const adjustmentBody = (balanceType, expected, desired) => ({ supplierId, balanceType, expectedCurrentBalance: { amount: expected, currency: 'PKR' }, desiredBalance: { amount: desired, currency: 'PKR' }, businessDate: '2026-09-24', reason: 'Reconciliation', category: 'opening_correction' });
  async function effect(kind, amount, sourceType, sourceId) { return ledgers.ledgersService.postLedgerEffect(null, { organizationId, partyType: 'supplier', supplierId, effectKind: kind, signedAmountMinorUnits: amount, sourceType, sourceId, postedAt: new Date(), postedBy: actor.actorId }); }
  return { organizationId, supplierId, accountId, actor, movements, purchases, ledgers, paymentsService, finance, service: financeService, refundBody, adjustmentBody, effect };
}

describe('supplier financial phase 3', () => {
  it('posts partial and full advance refunds without changing payable or revenue', async () => {
    const f = fixture(); await f.effect('supplier_advance', '5000000', 'supplier_opening_advance', f.supplierId);
    const first = await f.service.postRefund(f.organizationId, f.refundBody('20000.00'), f.actor, 'refund-partial');
    expect(first.data.amount.amount).toBe('20000.00');
    expect((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('30000.00');
    expect((await f.paymentsService.sumSupplierPayable(f.organizationId, f.supplierId)).amount).toBe('0.00');
    expect(f.movements).toHaveLength(1); expect(f.movements[0].signedAmountMinorUnits).toBe('2000000');
    expect(f.movements[0].sourceType).toBe('supplier_advance_refund');
    await f.service.postRefund(f.organizationId, f.refundBody('30000.00'), f.actor, 'refund-full');
    expect((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('0.00');
    expect(f.ledgers.store.listEffectsForTest().some((row) => row.effectKind === 'receivable')).toBe(false);
  });

  it('rejects refund above the latest advance and isolates tenants', async () => {
    const f = fixture(); await f.effect('supplier_advance', '2000000', 'supplier_opening_advance', f.supplierId);
    await expect(f.service.postRefund(f.organizationId, f.refundBody('25000.00'), f.actor, 'too-large')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(f.service.postRefund('org-b', f.refundBody('1.00'), f.actor, 'wrong-org')).rejects.toThrow('Supplier not found');
    expect(f.movements).toHaveLength(0);
  });

  it('reverses a refund once with compensating ledger and account effects', async () => {
    const f = fixture(); await f.effect('supplier_advance', '5000000', 'supplier_opening_advance', f.supplierId);
    const refund = await f.service.postRefund(f.organizationId, f.refundBody('20000.00'), f.actor, 'refund');
    const reversed = await f.service.reverseRefund(f.organizationId, refund.data.id, { reason: 'Supplier transfer recalled' }, f.actor, 'refund-reverse');
    expect(reversed.data.status).toBe('reversed');
    expect((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('50000.00');
    expect(f.movements.map((row) => row.signedAmountMinorUnits)).toEqual(['2000000', '-2000000']);
    await expect(f.service.reverseRefund(f.organizationId, refund.data.id, { reason: 'Again' }, f.actor, 'refund-reverse-2')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('replays identical refund idempotently and conflicts on a changed payload', async () => {
    const f = fixture(); await f.effect('supplier_advance', '5000000', 'supplier_opening_advance', f.supplierId);
    const first = await f.service.postRefund(f.organizationId, f.refundBody('10000.00'), f.actor, 'same-key');
    const replay = await f.service.postRefund(f.organizationId, f.refundBody('10000.00'), f.actor, 'same-key');
    expect(replay.replay).toBe(true); expect(replay.data.id).toBe(first.data.id); expect(f.movements).toHaveLength(1);
    await expect(f.service.postRefund(f.organizationId, f.refundBody('9000.00'), f.actor, 'same-key')).rejects.toThrow('Idempotency key reused with a different request');
  });

  it('adjusts advance in both directions with no cash effect and blocks negative desired balance', async () => {
    const f = fixture(); await f.effect('supplier_advance', '1000000', 'supplier_opening_advance', f.supplierId);
    const up = await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_advance', '10000.00', '12000.00'), f.actor, 'advance-up');
    expect(up.data.signedDeltaMinorUnits).toBe('200000');
    await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_advance', '12000.00', '7000.00'), f.actor, 'advance-down');
    expect((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('7000.00');
    expect(f.movements).toHaveLength(0);
    await expect(f.service.adjustBalance(f.organizationId, { ...f.adjustmentBody('supplier_advance', '7000.00', '0.00'), desiredBalance: { amount: '-1.00', currency: 'PKR' } }, f.actor, 'negative')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects stale adjustments with the latest authoritative balance', async () => {
    const f = fixture(); await f.effect('supplier_advance', '1000000', 'supplier_opening_advance', f.supplierId);
    await expect(f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_advance', '9000.00', '12000.00'), f.actor, 'stale')).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { latestBalance: { amount: '10000.00', currency: 'PKR' } } });
  });

  it('reverses an unconsumed advance increase and blocks reversal after consumption', async () => {
    const f = fixture(); await f.effect('supplier_advance', '1000000', 'supplier_opening_advance', f.supplierId);
    const adjustment = await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_advance', '10000.00', '15000.00'), f.actor, 'increase');
    await f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Restore source' }, f.actor, 'reverse-increase');
    expect((await f.paymentsService.sumSupplierAdvance(f.organizationId, f.supplierId)).amount).toBe('10000.00');
    const second = await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_advance', '10000.00', '15000.00'), f.actor, 'increase-2');
    await f.paymentsService.applySupplierAdvanceInSession(null, { organizationId: f.organizationId, supplierId: f.supplierId, purchaseId: 'purchase-consumes', amountMinorUnits: '1200000', postedAt: new Date(), postedBy: f.actor.actorId });
    await expect(f.service.reverseAdjustment(f.organizationId, second.data.id, { reason: 'Unsafe' }, f.actor, 'reverse-unsafe')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates a positive manual payable target consumed by general payment', async () => {
    const f = fixture();
    const adjustment = await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_payable', '0.00', '25000.00'), f.actor, 'payable-up');
    let targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    expect(targets).toHaveLength(1); expect(targets[0].targetType).toBe('supplier_manual_payable'); expect(targets[0].outstandingMinorUnits).toBe('2500000');
    const payment = await f.paymentsService.postSupplierPayment(f.organizationId, { supplierId: f.supplierId, accountId: f.accountId, amount: { amount: '10000.00', currency: 'PKR' }, paymentDate: '2026-09-24', allocationMode: 'general', notes: '' }, f.actor, 'general-payment');
    expect((await f.paymentsService.sumSupplierPayable(f.organizationId, f.supplierId)).amount).toBe('15000.00');
    targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    expect(targets[0].outstandingMinorUnits).toBe('1500000');
    await expect(f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Unsafe' }, f.actor, 'reverse-dependent')).rejects.toMatchObject({ code: 'CONFLICT' });
    await f.paymentsService.correctPayment(f.organizationId, payment.data.id, { reason: 'Entered in error' }, f.actor, 'correct-payment');
    targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    expect(targets[0].outstandingMinorUnits).toBe('2500000');
    await expect(f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Now safe' }, f.actor, 'reverse-safe')).resolves.toMatchObject({ data: { signedDeltaMinorUnits: '-2500000' } });
  });

  it('reduces payable targets in FIFO order and preserves the target-sum invariant', async () => {
    const f = fixture(); f.purchases.push({ id: 'purchase-1', outstandingMinorUnits: '1000000', purchaseDate: '2026-09-01', dueDate: null, sequence: '1' }, { id: 'purchase-2', outstandingMinorUnits: '1500000', purchaseDate: '2026-09-02', dueDate: null, sequence: '2' });
    await f.effect('payable', '2500000', 'purchase_payable', 'payable-seed');
    await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_payable', '25000.00', '18000.00'), f.actor, 'payable-down');
    const targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    expect(targets.map((row) => row.outstandingMinorUnits)).toEqual(['300000', '1500000']);
    expect(targets.reduce((sum, row) => sum + BigInt(row.outstandingMinorUnits), 0n)).toBe(1800000n);
    expect((await f.paymentsService.sumSupplierPayable(f.organizationId, f.supplierId)).amount).toBe('18000.00');
    await expect(f.paymentsService.assertSupplierPayableTargetUnadjusted(f.organizationId, f.supplierId, 'purchase', 'purchase-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('keeps invoice-specific payment on the selected purchase when a manual target exists', async () => {
    const f = fixture(); f.purchases.push({ id: 'purchase-1', outstandingMinorUnits: '1000000', purchaseDate: '2026-09-01', dueDate: null, sequence: '1' });
    await f.effect('payable', '1000000', 'purchase_payable', 'purchase-1');
    await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_payable', '10000.00', '15000.00'), f.actor, 'manual-target');
    await f.paymentsService.postSupplierPayment(f.organizationId, { supplierId: f.supplierId, accountId: f.accountId, amount: { amount: '4000.00', currency: 'PKR' }, paymentDate: '2026-09-24', allocationMode: 'invoice_specific', allocations: [{ purchaseId: 'purchase-1', amount: { amount: '4000.00', currency: 'PKR' } }], notes: '' }, f.actor, 'specific');
    const targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    const manual = targets.find((row) => row.targetType === 'supplier_manual_payable');
    expect(manual.outstandingMinorUnits).toBe('500000');
  });

  it('reverses payable target corrections and blocks double reversal', async () => {
    const f = fixture(); f.purchases.push({ id: 'purchase-1', outstandingMinorUnits: '2000000', purchaseDate: '2026-09-01', dueDate: null, sequence: '1' }); await f.effect('payable', '2000000', 'purchase_payable', 'purchase-1');
    const adjustment = await f.service.adjustBalance(f.organizationId, f.adjustmentBody('supplier_payable', '20000.00', '15000.00'), f.actor, 'reduce');
    await f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Restore' }, f.actor, 'restore');
    const targets = await f.paymentsService.listSupplierPayableTargetsForAdjustment(f.organizationId, f.supplierId);
    expect(targets[0].outstandingMinorUnits).toBe('2000000');
    expect((await f.paymentsService.sumSupplierPayable(f.organizationId, f.supplierId)).amount).toBe('20000.00');
    await expect(f.service.reverseAdjustment(f.organizationId, adjustment.data.id, { reason: 'Again' }, f.actor, 'again')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
