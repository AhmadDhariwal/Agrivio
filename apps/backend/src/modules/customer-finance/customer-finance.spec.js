import { describe, expect, it } from 'vitest';
import ledgersModule from '../payments-ledgers/ledgers.module';
import financeModule from './customer-finance.module';

const { createLedgersModule } = ledgersModule;
const { createCustomerFinanceModule } = financeModule;

function fixture(unpaidSales = []) {
  const movements = [];
  const accounts = new Map([
    ['account-a', { id: 'account-a', organizationId: 'org-a', status: 'active', accountType: 'bank' }],
    ['account-b', { id: 'account-b', organizationId: 'org-b', status: 'active', accountType: 'bank' }],
  ]);
  const customers = new Map([
    ['customer-a', { id: 'customer-a', organizationId: 'org-a', status: 'active', name: 'A' }],
    ['customer-b', { id: 'customer-b', organizationId: 'org-b', status: 'active', name: 'B' }],
  ]);
  const accountsService = {
    async getAccount(organizationId, id) {
      const row = accounts.get(id);
      if (!row || row.organizationId !== organizationId) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
      return row;
    },
    async postAccountMovement(_session, input) {
      const duplicate = movements.find((row) => row.organizationId === input.organizationId && row.sourceType === input.sourceType && String(row.sourceId) === String(input.sourceId));
      if (duplicate) throw Object.assign(new Error('duplicate movement'), { statusCode: 409 });
      const row = { id: `movement-${movements.length + 1}`, ...input };
      movements.push(row);
      return row;
    },
    async listAccountMovementsBySource(organizationId, sourceType, sourceId) {
      return movements.filter((row) => row.organizationId === organizationId && row.sourceType === sourceType && String(row.sourceId) === String(sourceId));
    },
  };
  const customersService = {
    async getCustomer(organizationId, id) {
      const row = customers.get(id);
      if (!row || row.organizationId !== organizationId) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
      return row;
    },
    async listCustomerSummariesByIds(organizationId, ids) {
      return ids.map((id) => customers.get(id)).filter((row) => row?.organizationId === organizationId);
    },
  };
  const ledgers = createLedgersModule({ persistence: 'memory' });
  let customerFinanceService = null;
  const paymentsService = ledgers.createPaymentsService({
    persistence: 'memory', accountsService, customersService,
    suppliersService: {}, listUnpaidSupplierPurchases: async () => [],
    listUnpaidCustomerSales: async () => unpaidSales,
    listManualCustomerReceivableTargets: (...args) => customerFinanceService?.listManualReceivableTargets(...args) ?? [],
    listCustomerTradeTargetAdjustments: (...args) => customerFinanceService?.listTradeTargetAdjustments(...args) ?? [],
  });
  const finance = createCustomerFinanceModule({ persistence: 'memory', ledgersService: ledgers.ledgersService, accountsService, customersService, paymentsService });
  customerFinanceService = finance.customerFinanceService;
  const actor = { actorId: 'user-a' };
  const loanBody = { customerId: 'customer-a', disbursementAccountId: 'account-a', principal: { amount: '500.00', currency: 'PKR' }, businessDate: '2026-09-24', reference: 'L-1' };
  return { ...finance, service: customerFinanceService, paymentsService, ledgers, movements, actor, loanBody };
}

describe('customer finance phase 2', () => {
  it('posts a principal-only loan atomically once without revenue or expense semantics', async () => {
    const f = fixture();
    const first = await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan-1');
    const replay = await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan-1');
    expect(replay.replay).toBe(true);
    expect(first.data.outstanding.amount).toBe('500.00');
    expect(f.movements).toHaveLength(1);
    expect(f.movements[0]).toMatchObject({ sourceType: 'customer_loan_disbursement', signedAmountMinorUnits: '-50000' });
    expect(f.movements.some((row) => row.sourceType === 'expense' || row.sourceType === 'sale_receivable')).toBe(false);
  });

  it('supports partial and full repayment while rejecting overpayment and never creating advance', async () => {
    const f = fixture(); const loan = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan')).data;
    const partial = await f.service.repayLoan('org-a', loan.id, { accountId: 'account-a', amount: { amount: '200.00' }, businessDate: '2026-09-24' }, f.actor, 'repay-1');
    expect(partial.data).toMatchObject({ status: 'partially_repaid', outstanding: { amount: '300.00', currency: 'PKR' } });
    await expect(f.service.repayLoan('org-a', loan.id, { accountId: 'account-a', amount: { amount: '301.00' }, businessDate: '2026-09-24' }, f.actor, 'too-much')).rejects.toMatchObject({ statusCode: 400 });
    const full = await f.service.repayLoan('org-a', loan.id, { accountId: 'account-a', amount: { amount: '300.00' }, businessDate: '2026-09-24' }, f.actor, 'repay-2');
    expect(full.data.status).toBe('repaid');
    expect((await f.ledgers.ledgersService.sumCustomerAdvance('org-a', 'customer-a')).amount).toBe('0.00');
  });

  it('keeps customer advances and normal customer payments isolated from loans', async () => {
    const f = fixture(); const loan = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan')).data;
    await f.ledgers.ledgersService.postLedgerEffect(null, { organizationId: 'org-a', partyType: 'customer', customerId: 'customer-a', effectKind: 'advance', signedAmountMinorUnits: '10000', sourceType: 'customer_opening_advance', sourceId: 'customer-a', postedAt: new Date(), postedBy: 'user-a' });
    await f.paymentsService.postCustomerPayment('org-a', { customerId: 'customer-a', accountId: 'account-a', amount: { amount: '25.00', currency: 'PKR' }, paymentDate: '2026-09-24', allocationMode: 'general', notes: '' }, f.actor, 'normal-payment');
    expect((await f.service.getLoan('org-a', loan.id)).outstanding.amount).toBe('500.00');
    expect((await f.ledgers.ledgersService.sumCustomerAdvance('org-a', 'customer-a')).amount).toBe('125.00');
  });

  it('reverses an untouched loan and rejects reversal when a repayment exists', async () => {
    const f = fixture(); const untouched = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan-a')).data;
    const reversed = await f.service.reverseLoan('org-a', untouched.id, { reason: 'wrong customer' }, f.actor, 'reverse-a');
    expect(reversed.data.status).toBe('reversed');
    expect(f.movements.at(-1).signedAmountMinorUnits).toBe('50000');
    const active = (await f.service.createLoan('org-a', { ...f.loanBody, reference: 'L-2' }, f.actor, 'loan-b')).data;
    await f.service.repayLoan('org-a', active.id, { accountId: 'account-a', amount: { amount: '10.00' }, businessDate: '2026-09-24' }, f.actor, 'repay');
    await expect(f.service.reverseLoan('org-a', active.id, { reason: 'wrong' }, f.actor, 'reverse-b')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reverses a repayment with compensating loan and account effects and reopens the loan', async () => {
    const f = fixture(); const loan = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan')).data;
    const repayment = (await f.service.repayLoan('org-a', loan.id, { accountId: 'account-a', amount: { amount: '500.00' }, businessDate: '2026-09-24' }, f.actor, 'repay')).data;
    await f.service.reverseRepayment('org-a', repayment.id, { reason: 'bounced payment' }, f.actor, 'reverse');
    expect((await f.service.getLoan('org-a', loan.id))).toMatchObject({ status: 'open', outstanding: { amount: '500.00', currency: 'PKR' } });
    expect(f.movements.at(-1).sourceType).toBe('customer_loan_repayment_reversal');
  });

  it('adjusts advance by delta, rejects stale state, and prevents negative advance', async () => {
    const f = fixture();
    await f.ledgers.ledgersService.postLedgerEffect(null, { organizationId: 'org-a', partyType: 'customer', customerId: 'customer-a', effectKind: 'advance', signedAmountMinorUnits: '10000', sourceType: 'customer_opening_advance', sourceId: 'customer-a', postedAt: new Date(), postedBy: 'user-a' });
    const base = { customerId: 'customer-a', balanceType: 'customer_advance', reason: 'reconcile', category: 'reconciliation', businessDate: '2026-09-24' };
    await f.service.adjustBalance('org-a', { ...base, expectedCurrentBalance: { amount: '100.00' }, desiredBalance: { amount: '120.00' } }, f.actor, 'up');
    await f.service.adjustBalance('org-a', { ...base, expectedCurrentBalance: { amount: '120.00' }, desiredBalance: { amount: '90.00' } }, f.actor, 'down');
    expect((await f.ledgers.ledgersService.sumCustomerAdvance('org-a', 'customer-a')).amount).toBe('90.00');
    await expect(f.service.adjustBalance('org-a', { ...base, expectedCurrentBalance: { amount: '120.00' }, desiredBalance: { amount: '80.00' } }, f.actor, 'stale')).rejects.toMatchObject({ statusCode: 409, details: { latestBalance: { amount: '90.00', currency: 'PKR' } } });
  });

  it('adjusts a specific loan without an account movement and reverses the adjustment', async () => {
    const f = fixture(); const loan = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'loan')).data; const movementCount = f.movements.length;
    const adjustment = await f.service.adjustBalance('org-a', { customerId: 'customer-a', balanceType: 'loan_receivable', loanId: loan.id, expectedCurrentBalance: { amount: '500.00' }, desiredBalance: { amount: '475.00' }, reason: 'record correction', category: 'reconciliation', businessDate: '2026-09-24' }, f.actor, 'adjust');
    expect((await f.service.getLoan('org-a', loan.id)).outstanding.amount).toBe('475.00');
    expect(f.movements).toHaveLength(movementCount);
    await f.service.reverseAdjustment('org-a', adjustment.data.id, { reason: 'correction not needed' }, f.actor, 'reverse-adjust');
    expect((await f.service.getLoan('org-a', loan.id)).outstanding.amount).toBe('500.00');
  });

  it('creates target-aware manual receivables and preserves target-sum equality through payment', async () => {
    const f = fixture();
    const adjustment = await f.service.adjustBalance('org-a', { customerId: 'customer-a', balanceType: 'trade_receivable', expectedCurrentBalance: { amount: '0.00' }, desiredBalance: { amount: '100.00' }, reason: 'missing receivable', category: 'reconciliation', businessDate: '2026-09-24', reference: 'MR-1' }, f.actor, 'trade-up');
    let targets = await f.paymentsService.listCustomerReceivableTargetsForAdjustment('org-a', 'customer-a');
    expect(targets.map((row) => row.outstandingMinorUnits)).toEqual(['10000']);
    await f.paymentsService.postCustomerPayment('org-a', { customerId: 'customer-a', accountId: 'account-a', amount: { amount: '40.00', currency: 'PKR' }, paymentDate: '2026-09-24', allocationMode: 'general', notes: '' }, f.actor, 'pay-manual');
    targets = await f.paymentsService.listCustomerReceivableTargetsForAdjustment('org-a', 'customer-a');
    expect(targets.reduce((sum, row) => sum + BigInt(row.outstandingMinorUnits), 0n)).toBe(6000n);
    expect((await f.ledgers.ledgersService.sumCustomerReceivable('org-a', 'customer-a')).amount).toBe('60.00');
    await expect(f.service.reverseAdjustment('org-a', adjustment.data.id, { reason: 'undo' }, f.actor, 'reverse-trade')).rejects.toMatchObject({ statusCode: 409 });
    await f.service.adjustBalance('org-a', { customerId: 'customer-a', balanceType: 'trade_receivable', expectedCurrentBalance: { amount: '60.00' }, desiredBalance: { amount: '25.00' }, reason: 'write down', category: 'reconciliation', businessDate: '2026-09-24' }, f.actor, 'trade-down');
    targets = await f.paymentsService.listCustomerReceivableTargetsForAdjustment('org-a', 'customer-a');
    expect(targets.reduce((sum, row) => sum + BigInt(row.outstandingMinorUnits), 0n)).toBe(2500n);
  });

  it('applies negative trade correction to the oldest sale target and blocks destructive source correction', async () => {
    const f = fixture([{ id: 'sale-a', targetId: 'sale-a', invoiceNumber: 'S-1', invoiceDate: '2026-09-01', dueDate: null, sequence: '1', outstandingMinorUnits: '10000' }]);
    await f.ledgers.ledgersService.postLedgerEffect(null, { organizationId: 'org-a', partyType: 'customer', customerId: 'customer-a', effectKind: 'receivable', signedAmountMinorUnits: '10000', sourceType: 'sale_receivable', sourceId: 'sale-a', postedAt: new Date(), postedBy: 'user-a' });
    await f.service.adjustBalance('org-a', { customerId: 'customer-a', balanceType: 'trade_receivable', expectedCurrentBalance: { amount: '100.00' }, desiredBalance: { amount: '80.00' }, reason: 'write down', category: 'reconciliation', businessDate: '2026-09-24' }, f.actor, 'sale-adjust');
    const targets = await f.paymentsService.listCustomerReceivableTargetsForAdjustment('org-a', 'customer-a');
    expect(targets).toMatchObject([{ id: 'sale-a', outstandingMinorUnits: '8000' }]);
    await expect(f.paymentsService.assertCustomerTradeTargetUnadjusted('org-a', 'customer-a', 'sale', 'sale-a')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('enforces tenant isolation across customer, account, loan, and repayment lookups', async () => {
    const f = fixture();
    await expect(f.service.createLoan('org-a', { ...f.loanBody, customerId: 'customer-b' }, f.actor, 'cross-customer')).rejects.toMatchObject({ statusCode: 404 });
    await expect(f.service.createLoan('org-a', { ...f.loanBody, disbursementAccountId: 'account-b' }, f.actor, 'cross-account')).rejects.toMatchObject({ statusCode: 404 });
    const loan = (await f.service.createLoan('org-a', f.loanBody, f.actor, 'valid')).data;
    await expect(f.service.getLoan('org-b', loan.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
