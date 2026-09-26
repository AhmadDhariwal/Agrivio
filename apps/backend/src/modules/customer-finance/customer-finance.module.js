const { createMockTransactionSessionPort, createTransactionRunner } = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, notFound, validationFailed, versionConflict } = require('../../platform/errors/app-error');
const { formatMoneyMinorUnits, parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const { createIdempotencyService, createInMemoryIdempotencyStore, createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');
const { parseLoan, parseRepayment, parseReverse, parseAdjustment } = require('./customer-finance.validation');
const { createMongooseCustomerFinanceStore, createInMemoryCustomerFinanceStore } = require('./customer-finance.store');

function mongooseSessionPort() {
  const mongoose = require('mongoose');
  return { async startSession() { return mongoose.startSession(); }, async withTransaction(session, work) { return session.withTransaction(() => work(session)); }, async endSession(session) { await session.endSession(); } };
}
function key(value) { if (typeof value !== 'string' || !value.trim()) throw validationFailed('Idempotency-Key header is required'); return value.trim(); }
function money(minor) { return { amount: formatMoneyMinorUnits(BigInt(String(minor ?? '0'))), currency: 'PKR' }; }
function actorId(actor) { return String(actor.actorId); }
function statusFor(loan, outstanding) { if (loan.status === 'reversed') return 'reversed'; if (outstanding === 0n) return 'repaid'; if (outstanding < BigInt(loan.principalMinorUnits)) return 'partially_repaid'; return 'open'; }
function loanDto(loan, outstanding, repaid = 0n) { const principal = BigInt(loan.principalMinorUnits); return { id: String(loan._id), organizationId: String(loan.organizationId), customerId: String(loan.customerId), principal: money(principal), outstanding: money(outstanding), repaid: money(loan.status === 'reversed' ? 0n : repaid), businessDate: loan.businessDate, dueDate: loan.dueDate ?? null, disbursementAccountId: String(loan.disbursementAccountId), status: statusFor(loan, outstanding), reference: loan.reference ?? null, notes: loan.notes ?? null, createdBy: String(loan.createdBy) }; }
function adjustmentDto(row) { return { id: String(row._id), customerId: String(row.customerId), balanceType: row.balanceType, loanId: row.loanId ? String(row.loanId) : null, expectedCurrentBalance: money(row.expectedCurrentMinorUnits), desiredBalance: money(row.desiredMinorUnits), delta: money(row.deltaMinorUnits), signedDeltaMinorUnits: String(row.deltaMinorUnits), reason: row.reason, category: row.category, businessDate: row.businessDate, reference: row.reference ?? null, notes: row.notes ?? null, status: row.status, reversalOfId: row.reversalOfId ? String(row.reversalOfId) : null, postedBy: row.postedBy ? String(row.postedBy) : null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null }; }

function createCustomerFinanceService(deps) {
  const { store, ledgersService, accountsService, customersService, paymentsService, transactionRunner, idempotency } = deps;
  const now = deps.now ?? (() => new Date());
  const audit = createAuditWriter({ append: (session, event) => store.appendAuditEvent(session, event) });

  async function customer(organizationId, customerId) {
    const value = await customersService.getCustomer(organizationId, customerId);
    if (value.status !== 'active') throw validationFailed('Customer must be active');
    return value;
  }
  async function loanOutstanding(organizationId, loanId, session) {
    const loan = await store.findLoan(organizationId, loanId, session);
    if (!loan) throw notFound('Customer loan not found');
    const map = await ledgersService.listCustomerLoanBalances(
      organizationId,
      loan.customerId,
      session,
    );
    return BigInt(String(map.get(String(loanId)) ?? '0'));
  }
  async function postEffect(session, input) { return ledgersService.postLedgerEffect(session, { ...input, partyType: 'customer', effectKind: input.effectKind, postedAt: input.postedAt ?? now(), currency: 'PKR' }); }
  async function execute(operation, organizationId, actor, idempotencyKey, request, work, statusCode = 201) {
    const result = await idempotency.execute({ scopeType: 'organization', organizationId, actorId: actorId(actor), operation }, key(idempotencyKey), request, async () => ({ statusCode, body: await transactionRunner.run(work) }));
    return { replay: result.replay, statusCode: result.response.statusCode, data: result.response.body };
  }

  return {
    async createLoan(organizationId, body, actor, idempotencyKey) {
      const input = parseLoan(body);
      return execute('customer-loans.post', organizationId, actor, idempotencyKey, input, async (session) => {
        await customer(organizationId, input.customerId);
        await accountsService.getAccount(organizationId, input.accountId);
        const loanId = store.allocateId(); const postedAt = now();
        const loan = await store.insertLoan(session, { _id: loanId, organizationId, customerId: input.customerId, principalMinorUnits: input.principalMinorUnits, currency: 'PKR', disbursementAccountId: input.accountId, businessDate: input.businessDate, dueDate: input.dueDate, reference: input.reference, notes: input.notes, status: 'posted', createdBy: actorId(actor) });
        await postEffect(session, { organizationId, customerId: input.customerId, loanId, signedAmountMinorUnits: input.principalMinorUnits, sourceType: 'customer_loan_disbursement', sourceId: loanId, postedAt, postedBy: actorId(actor), effectKind: 'loan_receivable' });
        await accountsService.postAccountMovement(session, { organizationId, accountId: input.accountId, signedAmountMinorUnits: `-${input.principalMinorUnits}`, sourceType: 'customer_loan_disbursement', sourceId: loanId, businessDate: input.businessDate, reference: input.reference, notes: input.notes, purpose: 'Customer loan disbursement', postedAt, postedBy: actorId(actor) });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_loan.disbursed', resourceType: 'customer_loan', resourceId: String(loanId), metadata: { customerId: input.customerId, accountId: input.accountId, principalMinorUnits: input.principalMinorUnits } });
        return loanDto(loan, BigInt(input.principalMinorUnits));
      });
    },

    async listLoans(organizationId, query) {
      if (query.status && !['open', 'partially_repaid', 'repaid', 'reversed'].includes(query.status)) {
        throw validationFailed('status is invalid');
      }
      for (const field of ['fromDate', 'toDate']) {
        if (query[field] && !/^\d{4}-\d{2}-\d{2}$/.test(String(query[field]))) {
          throw validationFailed(`${field} must use YYYY-MM-DD`);
        }
      }
      const page = Number(query.page ?? 1); const pageSize = Math.min(Number(query.pageSize ?? 25), 100); const skip = (page - 1) * pageSize;
      const result = await store.listLoans(organizationId, { customerId: query.customerId, fromDate: query.fromDate, toDate: query.toDate, dueDateFrom: query.dueDateFrom, dueDateTo: query.dueDateTo, search: query.search }, { skip: 0, pageSize: 100000 });
      const [balances, repayments] = await Promise.all([
        ledgersService.listCustomerLoanBalances(organizationId, query.customerId),
        ledgersService.listCustomerLoanRepaymentTotals(organizationId, query.customerId),
      ]);
      let items = result.items.map((row) => loanDto(row, BigInt(String(balances.get(String(row._id)) ?? '0')), BigInt(String(repayments.get(String(row._id)) ?? '0'))));
      if (query.status) items = items.filter((row) => row.status === query.status);
      return { items: items.slice(skip, skip + pageSize), total: items.length, page, pageSize };
    },

    async listAdjustmentsForReporting(organizationId) {
      const rows = await store.listAdjustmentsForReporting(organizationId);
      return rows.map(adjustmentDto);
    },

    async getLoan(organizationId, loanId) { const loan = await store.findLoan(organizationId, loanId); if (!loan) throw notFound('Customer loan not found'); const [outstanding, repaymentTotals, repayments] = await Promise.all([loanOutstanding(organizationId, loanId), ledgersService.listCustomerLoanRepaymentTotals(organizationId, loan.customerId), store.listRepayments(organizationId, loanId)]); return { ...loanDto(loan, outstanding, BigInt(String(repaymentTotals.get(String(loanId)) ?? '0'))), repayments: repayments.map((row) => ({ id: String(row._id), amount: money(row.amountMinorUnits), accountId: String(row.accountId), businessDate: row.businessDate, reference: row.reference ?? null, notes: row.notes ?? null, status: row.status, postedBy: String(row.postedBy) })) }; },

    async repayLoan(organizationId, loanId, body, actor, idempotencyKey) {
      const input = parseRepayment(body);
      return execute('customer-loans.repay', organizationId, actor, idempotencyKey, { loanId, ...input }, async (session) => {
        const loan = await store.findLoan(organizationId, loanId, session); if (!loan || loan.status !== 'posted') throw notFound('Open customer loan not found');
        await accountsService.getAccount(organizationId, input.accountId);
        const outstanding = await loanOutstanding(organizationId, loanId, session); const amount = BigInt(input.amountMinorUnits);
        if (amount > outstanding) throw validationFailed('Repayment exceeds loan outstanding', [{ field: 'amount', message: `latest outstanding is ${formatMoneyMinorUnits(outstanding)}`, latestOutstanding: money(outstanding) }]);
        const repaymentId = store.allocateId(); const postedAt = now();
        const repayment = await store.insertRepayment(session, { _id: repaymentId, organizationId, loanId, customerId: loan.customerId, accountId: input.accountId, amountMinorUnits: input.amountMinorUnits, currency: 'PKR', businessDate: input.businessDate, reference: input.reference, notes: input.notes, status: 'posted', postedBy: actorId(actor) });
        await postEffect(session, { organizationId, customerId: loan.customerId, loanId, signedAmountMinorUnits: `-${input.amountMinorUnits}`, sourceType: 'customer_loan_repayment', sourceId: repaymentId, postedAt, postedBy: actorId(actor), effectKind: 'loan_receivable' });
        await accountsService.postAccountMovement(session, { organizationId, accountId: input.accountId, signedAmountMinorUnits: input.amountMinorUnits, sourceType: 'customer_loan_repayment', sourceId: repaymentId, businessDate: input.businessDate, reference: input.reference, notes: input.notes, purpose: 'Customer loan repayment', postedAt, postedBy: actorId(actor) });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_loan.repaid', resourceType: 'customer_loan_repayment', resourceId: String(repaymentId), metadata: { loanId, amountMinorUnits: input.amountMinorUnits } });
        return { id: String(repayment._id), loanId: String(loanId), amount: money(input.amountMinorUnits), outstanding: money(outstanding - amount), status: outstanding === amount ? 'repaid' : 'partially_repaid' };
      });
    },

    async reverseRepayment(organizationId, repaymentId, body, actor, idempotencyKey) {
      const input = parseReverse(body);
      return execute('customer-loan-repayments.reverse', organizationId, actor, idempotencyKey, { repaymentId, reason: input.reason }, async (session) => {
        const repayment = await store.findRepayment(organizationId, repaymentId, session); if (!repayment) throw notFound('Customer loan repayment not found'); if (repayment.status !== 'posted') throw conflict('Customer loan repayment is already reversed');
        const loan = await store.findLoan(organizationId, repayment.loanId, session); if (!loan || loan.status !== 'posted') throw conflict('Customer loan is not active');
        const [ledger] = await ledgersService.listEffectsBySource(organizationId, 'customer_loan_repayment', repaymentId, session); const [movement] = await accountsService.listAccountMovementsBySource(organizationId, 'customer_loan_repayment', repaymentId, session); if (!ledger || !movement) throw conflict('Repayment financial effects are incomplete');
        const postedAt = now();
        await postEffect(session, { organizationId, customerId: repayment.customerId, loanId: repayment.loanId, signedAmountMinorUnits: repayment.amountMinorUnits, sourceType: 'customer_loan_repayment_reversal', sourceId: repaymentId, reversalOfId: ledger.id, postedAt, postedBy: actorId(actor), effectKind: 'loan_receivable' });
        await accountsService.postAccountMovement(session, { organizationId, accountId: repayment.accountId, signedAmountMinorUnits: `-${repayment.amountMinorUnits}`, sourceType: 'customer_loan_repayment_reversal', sourceId: repaymentId, reversalOfId: movement.id, businessDate: repayment.businessDate, purpose: 'Customer loan repayment reversal', notes: input.reason, postedAt, postedBy: actorId(actor) });
        const updated = await store.updateRepayment(session, organizationId, repaymentId, { status: 'posted' }, { status: 'reversed', reversedAt: postedAt, reversedBy: actorId(actor), reversalReason: input.reason }); if (!updated) throw conflict('Repayment changed while reversal was posting');
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_loan_repayment.reversed', resourceType: 'customer_loan_repayment', resourceId: repaymentId, reason: input.reason, metadata: { loanId: String(repayment.loanId) } });
        return { id: repaymentId, status: 'reversed' };
      }, 200);
    },

    async reverseLoan(organizationId, loanId, body, actor, idempotencyKey) {
      const input = parseReverse(body);
      return execute('customer-loans.reverse', organizationId, actor, idempotencyKey, { loanId, reason: input.reason }, async (session) => {
        const loan = await store.findLoan(organizationId, loanId, session); if (!loan) throw notFound('Customer loan not found'); if (loan.status !== 'posted') throw conflict('Customer loan is already reversed');
        if (await store.countActiveRepayments(organizationId, loanId, session)) throw conflict('Loan with active repayments cannot be reversed');
        const outstanding = await loanOutstanding(organizationId, loanId, session); if (outstanding !== BigInt(loan.principalMinorUnits)) throw conflict('Loan with dependent adjustments cannot be reversed');
        const [ledger] = await ledgersService.listEffectsBySource(organizationId, 'customer_loan_disbursement', loanId, session); const [movement] = await accountsService.listAccountMovementsBySource(organizationId, 'customer_loan_disbursement', loanId, session); if (!ledger || !movement) throw conflict('Loan financial effects are incomplete');
        const postedAt = now();
        await postEffect(session, { organizationId, customerId: loan.customerId, loanId, signedAmountMinorUnits: `-${loan.principalMinorUnits}`, sourceType: 'customer_loan_reversal', sourceId: loanId, reversalOfId: ledger.id, postedAt, postedBy: actorId(actor), effectKind: 'loan_receivable' });
        await accountsService.postAccountMovement(session, { organizationId, accountId: loan.disbursementAccountId, signedAmountMinorUnits: loan.principalMinorUnits, sourceType: 'customer_loan_reversal', sourceId: loanId, reversalOfId: movement.id, businessDate: loan.businessDate, purpose: 'Customer loan reversal', notes: input.reason, postedAt, postedBy: actorId(actor) });
        const updated = await store.updateLoan(session, organizationId, loanId, { status: 'posted' }, { status: 'reversed', reversedAt: postedAt, reversedBy: actorId(actor), reversalReason: input.reason }); if (!updated) throw conflict('Loan changed while reversal was posting');
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_loan.reversed', resourceType: 'customer_loan', resourceId: loanId, reason: input.reason });
        return loanDto(updated, 0n);
      }, 200);
    },

    async adjustBalance(organizationId, body, actor, idempotencyKey) {
      const input = parseAdjustment(body);
      return execute('customer-balances.adjust', organizationId, actor, idempotencyKey, input, async (session) => {
        await customer(organizationId, input.customerId);
        await ledgersService.lockCustomerFinancialPosition(session, organizationId, input.customerId);
        let current;
        if (input.balanceType === 'trade_receivable') current = parseMoneyMinorUnits((await ledgersService.sumCustomerReceivable(organizationId, input.customerId, session)).amount);
        else if (input.balanceType === 'customer_advance') current = parseMoneyMinorUnits((await ledgersService.sumCustomerAdvance(organizationId, input.customerId, session)).amount);
        else { const loan = await store.findLoan(organizationId, input.loanId, session); if (!loan || String(loan.customerId) !== input.customerId || loan.status !== 'posted') throw notFound('Customer loan not found'); current = await loanOutstanding(organizationId, input.loanId, session); }
        if (current !== BigInt(input.expectedCurrentMinorUnits)) throw versionConflict('Customer balance changed; review the latest authoritative balance', { latestBalance: money(current) });
        const desired = BigInt(input.desiredMinorUnits); const delta = desired - current;
        if (input.balanceType === 'customer_advance' && desired < 0n) throw validationFailed('Customer advance cannot be negative');
        const adjustmentId = store.allocateId(); let targetEffects = [];
        if (input.balanceType === 'trade_receivable' && delta !== 0n) {
          if (delta > 0n) targetEffects = [{ targetType: 'customer_manual_receivable', targetId: adjustmentId, signedAmountMinorUnits: delta.toString() }];
          else {
            let remaining = -delta; const targets = await paymentsService.listCustomerReceivableTargetsForAdjustment(organizationId, input.customerId);
            for (const target of targets) { if (remaining === 0n) break; const outstanding = BigInt(target.outstandingMinorUnits); const applied = outstanding < remaining ? outstanding : remaining; targetEffects.push({ targetType: target.targetType ?? 'sale', targetId: target.targetId ?? target.id, signedAmountMinorUnits: `-${applied}` }); remaining -= applied; }
            if (remaining > 0n) throw validationFailed('Desired trade receivable is below the allocatable target total');
          }
        }
        const row = await store.insertAdjustment(session, { _id: adjustmentId, organizationId, customerId: input.customerId, balanceType: input.balanceType, loanId: input.loanId, expectedCurrentMinorUnits: input.expectedCurrentMinorUnits, desiredMinorUnits: input.desiredMinorUnits, deltaMinorUnits: delta.toString(), currency: 'PKR', reason: input.reason, category: input.category, businessDate: input.businessDate, reference: input.reference, notes: input.notes, targetEffects, status: 'posted', reversalOfId: null, postedBy: actorId(actor) });
        if (delta !== 0n) await postEffect(session, { organizationId, customerId: input.customerId, loanId: input.loanId, signedAmountMinorUnits: delta.toString(), sourceType: input.balanceType === 'trade_receivable' ? 'customer_trade_receivable_adjustment' : input.balanceType === 'customer_advance' ? 'customer_advance_adjustment' : 'customer_loan_adjustment', sourceId: adjustmentId, postedBy: actorId(actor), effectKind: input.balanceType === 'trade_receivable' ? 'receivable' : input.balanceType === 'customer_advance' ? 'advance' : 'loan_receivable' });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_balance.adjusted', resourceType: 'customer_balance_adjustment', resourceId: String(adjustmentId), reason: input.reason, metadata: { customerId: input.customerId, balanceType: input.balanceType, deltaMinorUnits: delta.toString() } });
        return adjustmentDto(row);
      });
    },

    async reverseAdjustment(organizationId, adjustmentId, body, actor, idempotencyKey) {
      const input = parseReverse(body);
      return execute('customer-balances.adjustment.reverse', organizationId, actor, idempotencyKey, { adjustmentId, reason: input.reason }, async (session) => {
        const original = await store.findAdjustment(organizationId, adjustmentId, session); if (!original) throw notFound('Customer balance adjustment not found'); if (original.status !== 'posted' || original.reversalOfId) throw conflict('Customer balance adjustment cannot be reversed');
        if (await store.findAdjustmentReversal(organizationId, adjustmentId, session)) throw conflict('Customer balance adjustment is already reversed');
        const reversalId = store.allocateId(); const delta = -BigInt(original.deltaMinorUnits); const targetEffects = original.targetEffects.map((effect) => ({ targetType: effect.targetType, targetId: effect.targetId, signedAmountMinorUnits: (-BigInt(effect.signedAmountMinorUnits)).toString() }));
        if (original.balanceType === 'customer_advance') {
          const current = parseMoneyMinorUnits((await ledgersService.sumCustomerAdvance(organizationId, original.customerId, session)).amount);
          if (current + delta < 0n) throw conflict('Adjustment reversal would make customer advance negative');
        }
        if (original.balanceType === 'loan_receivable') {
          const current = await loanOutstanding(organizationId, original.loanId, session);
          if (current + delta < 0n) throw conflict('Adjustment reversal would make loan outstanding negative');
        }
        if (original.balanceType === 'trade_receivable' && BigInt(original.deltaMinorUnits) > 0n) {
          const targets = await paymentsService.listCustomerReceivableTargetsForAdjustment(organizationId, String(original.customerId), session);
          const manual = targets.find((target) => target.targetType === 'customer_manual_receivable' && String(target.targetId) === String(original._id));
          if (!manual || BigInt(manual.outstandingMinorUnits) !== BigInt(original.deltaMinorUnits)) throw conflict('Manual receivable adjustment has dependent payments or corrections');
        }
        const row = await store.insertAdjustment(session, { _id: reversalId, organizationId, customerId: original.customerId, balanceType: original.balanceType, loanId: original.loanId, expectedCurrentMinorUnits: original.desiredMinorUnits, desiredMinorUnits: original.expectedCurrentMinorUnits, deltaMinorUnits: delta.toString(), currency: 'PKR', reason: input.reason, category: 'reversal', businessDate: original.businessDate, reference: original.reference, notes: null, targetEffects, status: 'posted', reversalOfId: original._id, postedBy: actorId(actor) });
        const [ledger] = await ledgersService.listEffectsBySource(organizationId, original.balanceType === 'trade_receivable' ? 'customer_trade_receivable_adjustment' : original.balanceType === 'customer_advance' ? 'customer_advance_adjustment' : 'customer_loan_adjustment', adjustmentId, session);
        if (delta !== 0n) await postEffect(session, { organizationId, customerId: original.customerId, loanId: original.loanId, signedAmountMinorUnits: delta.toString(), sourceType: 'customer_balance_adjustment_reversal', sourceId: reversalId, reversalOfId: ledger?.id ?? null, postedBy: actorId(actor), effectKind: original.balanceType === 'trade_receivable' ? 'receivable' : original.balanceType === 'customer_advance' ? 'advance' : 'loan_receivable' });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'customer_balance_adjustment.reversed', resourceType: 'customer_balance_adjustment', resourceId: String(reversalId), reason: input.reason, metadata: { reversalOfId: adjustmentId } });
        return adjustmentDto(row);
      }, 200);
    },

    async listManualReceivableTargets(organizationId, customerId, session) {
      const rows = await store.listCustomerTradeAdjustments(organizationId, customerId, session);
      return rows.filter((row) => !row.reversalOfId && BigInt(row.deltaMinorUnits) > 0n).map((row) => ({ id: String(row._id), targetId: String(row._id), targetType: 'customer_manual_receivable', invoiceNumber: row.reference || 'Manual receivable adjustment', invoiceDate: row.businessDate, dueDate: null, sequence: String(row._id), outstandingMinorUnits: '0' }));
    },
    async listTradeTargetAdjustments(organizationId, customerId, session) { const rows = await store.listCustomerTradeAdjustments(organizationId, customerId, session); return rows.flatMap((row) => row.targetEffects.map((effect) => ({ targetType: effect.targetType, targetId: String(effect.targetId), signedAmountMinorUnits: String(effect.signedAmountMinorUnits) }))); },
    async assertTradeTargetUnadjusted(organizationId, customerId, targetType, targetId) {
      const effects = await this.listTradeTargetAdjustments(organizationId, customerId);
      const net = effects
        .filter((effect) => effect.targetType === targetType && String(effect.targetId) === String(targetId))
        .reduce((sum, effect) => sum + BigInt(effect.signedAmountMinorUnits), 0n);
      if (net !== 0n) throw conflict('Trade receivable target has an active balance adjustment; reverse it first');
    },
  };
}

function createCustomerFinanceModule(options) {
  const persistence = options.persistence ?? 'memory'; const store = options.store ?? (persistence === 'mongoose' ? createMongooseCustomerFinanceStore() : createInMemoryCustomerFinanceStore());
  const transactionRunner = options.transactionRunner ?? createTransactionRunner(options.sessionPort ?? (persistence === 'mongoose' ? mongooseSessionPort() : createMockTransactionSessionPort().port));
  const idempotency = options.idempotency ?? createIdempotencyService(options.idempotencyStore ?? (persistence === 'mongoose' ? createMongooseIdempotencyStore() : createInMemoryIdempotencyStore()));
  return { store, customerFinanceService: createCustomerFinanceService({ ...options, store, transactionRunner, idempotency }) };
}
module.exports = { createCustomerFinanceModule, createCustomerFinanceService };
