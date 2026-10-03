const { createMockTransactionSessionPort, createTransactionRunner } = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, notFound, validationFailed, versionConflict } = require('../../platform/errors/app-error');
const { formatMoneyMinorUnits, parseMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const { createIdempotencyService, createInMemoryIdempotencyStore, createMongooseIdempotencyStore } = require('../../platform/idempotency/idempotency-service');
const { parseRefund, parseAdjustment, parseReverse } = require('./supplier-finance.validation');
const { createMongooseSupplierFinanceStore, createInMemorySupplierFinanceStore } = require('./supplier-finance.store');

function mongooseSessionPort() {
  const mongoose = require('mongoose');
  return { async startSession() { return mongoose.startSession(); }, async withTransaction(session, work) { return session.withTransaction(() => work(session)); }, async endSession(session) { await session.endSession(); } };
}
function requireKey(value) { if (typeof value !== 'string' || !value.trim()) throw validationFailed('Idempotency-Key header is required'); return value.trim(); }
function actorId(actor) { return String(actor.actorId); }
function money(value) { return { amount: formatMoneyMinorUnits(BigInt(String(value ?? '0'))), currency: 'PKR' }; }
function sourceType(balanceType) { return balanceType === 'supplier_payable' ? 'supplier_payable_adjustment' : 'supplier_advance_adjustment'; }
function effectKind(balanceType) { return balanceType === 'supplier_payable' ? 'payable' : 'supplier_advance'; }
function refundDto(row) { return { id: String(row._id), organizationId: String(row.organizationId), supplierId: String(row.supplierId), accountId: String(row.accountId), amount: money(row.amountMinorUnits), businessDate: row.businessDate, reference: row.reference ?? null, notes: row.notes ?? null, status: row.status, postedBy: String(row.postedBy), reversedAt: row.reversedAt ?? null, reversedBy: row.reversedBy ? String(row.reversedBy) : null, reversalReason: row.reversalReason ?? null }; }
function adjustmentDto(row) { return { id: String(row._id), supplierId: String(row.supplierId), balanceType: row.balanceType, expectedCurrentBalance: money(row.expectedCurrentMinorUnits), desiredBalance: money(row.desiredMinorUnits), delta: money(row.deltaMinorUnits), signedDeltaMinorUnits: String(row.deltaMinorUnits), reason: row.reason, category: row.category, businessDate: row.businessDate, reference: row.reference ?? null, notes: row.notes ?? null, status: row.status, reversalOfId: row.reversalOfId ? String(row.reversalOfId) : null, postedBy: row.postedBy ? String(row.postedBy) : null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null }; }

function createSupplierFinanceService(deps) {
  const { store, ledgersService, accountsService, suppliersService, paymentsService, transactionRunner, idempotency } = deps;
  const now = deps.now ?? (() => new Date());
  const audit = createAuditWriter({ append: (session, event) => store.appendAuditEvent(session, event) });

  async function supplier(organizationId, supplierId) {
    const value = await suppliersService.getSupplier(organizationId, supplierId);
    if (value.status !== 'active') throw validationFailed('Supplier must be active');
    return value;
  }
  async function execute(operation, organizationId, actor, idempotencyKey, request, work, statusCode = 201) {
    const result = await idempotency.execute({ scopeType: 'organization', organizationId, actorId: actorId(actor), operation }, requireKey(idempotencyKey), request, async () => ({ statusCode, body: await transactionRunner.run(work) }));
    return { replay: result.replay, statusCode: result.response.statusCode, data: result.response.body };
  }
  async function assertCapability(organizationId, moduleKey, action) {
    if (!deps.capabilityService) return;
    await deps.capabilityService.assertAllowed(organizationId, moduleKey, 'enabled');
    await deps.capabilityService.assertAllowed(organizationId, action, 'allowed');
  }
  async function currentBalance(organizationId, supplierId, balanceType, session) {
    const dto = balanceType === 'supplier_payable'
      ? await ledgersService.sumSupplierPayable(organizationId, supplierId, session)
      : await ledgersService.sumSupplierAdvance(organizationId, supplierId, session);
    return parseMoneyMinorUnits(dto.amount);
  }
  async function postEffect(session, input) {
    return ledgersService.postLedgerEffect(session, { ...input, partyType: 'supplier', currency: 'PKR', postedAt: input.postedAt ?? now() });
  }

  return {
    async postRefund(organizationId, body, actor, idempotencyKey) {
      await assertCapability(organizationId, 'payments.supplier', 'payments.supplier.actions.post');
      const input = parseRefund(body);
      return execute('supplier-refunds.post', organizationId, actor, idempotencyKey, input, async (session) => {
        await supplier(organizationId, input.supplierId);
        await accountsService.getAccount(organizationId, input.accountId);
        await ledgersService.lockSupplierFinancialPosition(session, organizationId, input.supplierId);
        const available = await currentBalance(organizationId, input.supplierId, 'supplier_advance', session);
        const amount = BigInt(input.amountMinorUnits);
        if (amount > available) throw validationFailed('Refund exceeds available supplier advance', [{ field: 'amount', message: `latest available advance is ${formatMoneyMinorUnits(available)}`, latestAvailableAdvance: money(available) }]);
        const refundId = store.allocateId(); const postedAt = now();
        const row = await store.insertRefund(session, { _id: refundId, organizationId, supplierId: input.supplierId, accountId: input.accountId, amountMinorUnits: input.amountMinorUnits, currency: 'PKR', businessDate: input.businessDate, reference: input.reference, notes: input.notes, status: 'posted', postedBy: actorId(actor) });
        await postEffect(session, { organizationId, supplierId: input.supplierId, effectKind: 'supplier_advance', signedAmountMinorUnits: `-${input.amountMinorUnits}`, sourceType: 'supplier_advance_refund', sourceId: refundId, postedAt, postedBy: actorId(actor) });
        await accountsService.postAccountMovement(session, { organizationId, accountId: input.accountId, signedAmountMinorUnits: input.amountMinorUnits, sourceType: 'supplier_advance_refund', sourceId: refundId, businessDate: input.businessDate, reference: input.reference, notes: input.notes, purpose: 'Supplier advance refund', postedAt, postedBy: actorId(actor) });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'supplier_refund.posted', resourceType: 'supplier_refund', resourceId: String(refundId), metadata: { supplierId: input.supplierId, accountId: input.accountId, amountMinorUnits: input.amountMinorUnits } });
        return refundDto(row);
      });
    },

    async reverseRefund(organizationId, refundId, body, actor, idempotencyKey) {
      await assertCapability(organizationId, 'payments.supplier', 'payments.supplier.actions.correct');
      const input = parseReverse(body);
      return execute('supplier-refunds.reverse', organizationId, actor, idempotencyKey, { refundId, reason: input.reason }, async (session) => {
        const refund = await store.findRefund(organizationId, refundId, session);
        if (!refund) throw notFound('Supplier refund not found');
        if (refund.status !== 'posted') throw conflict('Supplier refund is already reversed');
        await ledgersService.lockSupplierFinancialPosition(session, organizationId, refund.supplierId);
        const [ledger] = await ledgersService.listEffectsBySource(organizationId, 'supplier_advance_refund', refundId, session);
        const [movement] = await accountsService.listAccountMovementsBySource(organizationId, 'supplier_advance_refund', refundId, session);
        if (!ledger || !movement) throw conflict('Supplier refund financial effects are incomplete');
        const postedAt = now();
        await postEffect(session, { organizationId, supplierId: refund.supplierId, effectKind: 'supplier_advance', signedAmountMinorUnits: refund.amountMinorUnits, sourceType: 'supplier_advance_refund_reversal', sourceId: refundId, reversalOfId: ledger.id, postedAt, postedBy: actorId(actor) });
        await accountsService.postAccountMovement(session, { organizationId, accountId: refund.accountId, signedAmountMinorUnits: `-${refund.amountMinorUnits}`, sourceType: 'supplier_advance_refund_reversal', sourceId: refundId, reversalOfId: movement.id, businessDate: refund.businessDate, purpose: 'Supplier advance refund reversal', notes: input.reason, postedAt, postedBy: actorId(actor) });
        const updated = await store.updateRefund(session, organizationId, refundId, { status: 'posted' }, { status: 'reversed', reversedAt: postedAt, reversedBy: actorId(actor), reversalReason: input.reason });
        if (!updated) throw conflict('Supplier refund changed while reversal was posting');
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'supplier_refund.reversed', resourceType: 'supplier_refund', resourceId: refundId, reason: input.reason });
        return refundDto(updated);
      }, 200);
    },

    async listRefunds(organizationId, query) {
      if (query.status && !['posted', 'reversed'].includes(query.status)) throw validationFailed('status is invalid');
      for (const field of ['fromDate', 'toDate']) if (query[field] && !/^\d{4}-\d{2}-\d{2}$/.test(String(query[field]))) throw validationFailed(`${field} must use YYYY-MM-DD`);
      if (query.supplierId) await suppliersService.getSupplier(organizationId, query.supplierId);
      const page = Number(query.page ?? 1); const pageSize = Math.min(Number(query.pageSize ?? 25), 100); const skip = (page - 1) * pageSize;
      const result = await store.listRefunds(organizationId, query, { skip, pageSize });
      return { items: result.items.map(refundDto), total: result.total, page, pageSize };
    },

    async listAdjustmentsForReporting(organizationId) {
      const rows = await store.listAdjustmentsForReporting(organizationId);
      return rows.map(adjustmentDto);
    },

    async adjustBalance(organizationId, body, actor, idempotencyKey) {
      await assertCapability(organizationId, 'suppliers', 'suppliers.actions.edit');
      const input = parseAdjustment(body);
      return execute('supplier-balances.adjust', organizationId, actor, idempotencyKey, input, async (session) => {
        await supplier(organizationId, input.supplierId);
        await ledgersService.lockSupplierFinancialPosition(session, organizationId, input.supplierId);
        const current = await currentBalance(organizationId, input.supplierId, input.balanceType, session);
        if (current !== BigInt(input.expectedCurrentMinorUnits)) throw versionConflict('Supplier balance changed; review the latest authoritative balance', { latestBalance: money(current) });
        const desired = BigInt(input.desiredMinorUnits); const delta = desired - current;
        const adjustmentId = store.allocateId(); let targetEffects = [];
        if (input.balanceType === 'supplier_payable' && delta !== 0n) {
          if (delta > 0n) targetEffects = [{ targetType: 'supplier_manual_payable', targetId: adjustmentId, signedAmountMinorUnits: delta.toString() }];
          else {
            let remaining = -delta;
            const targets = await paymentsService.listSupplierPayableTargetsForAdjustment(organizationId, input.supplierId, session);
            for (const target of targets) { if (remaining === 0n) break; const outstanding = BigInt(target.outstandingMinorUnits); const applied = outstanding < remaining ? outstanding : remaining; targetEffects.push({ targetType: target.targetType ?? 'purchase', targetId: target.targetId ?? target.id, signedAmountMinorUnits: `-${applied}` }); remaining -= applied; }
            if (remaining > 0n) throw validationFailed('Desired supplier payable is below the allocatable target total');
          }
        }
        const row = await store.insertAdjustment(session, { _id: adjustmentId, organizationId, supplierId: input.supplierId, balanceType: input.balanceType, expectedCurrentMinorUnits: input.expectedCurrentMinorUnits, desiredMinorUnits: input.desiredMinorUnits, deltaMinorUnits: delta.toString(), currency: 'PKR', reason: input.reason, category: input.category, businessDate: input.businessDate, reference: input.reference, notes: input.notes, targetEffects, status: 'posted', reversalOfId: null, postedBy: actorId(actor) });
        if (delta !== 0n) await postEffect(session, { organizationId, supplierId: input.supplierId, effectKind: effectKind(input.balanceType), signedAmountMinorUnits: delta.toString(), sourceType: sourceType(input.balanceType), sourceId: adjustmentId, postedBy: actorId(actor) });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'supplier_balance.adjusted', resourceType: 'supplier_balance_adjustment', resourceId: String(adjustmentId), reason: input.reason, metadata: { supplierId: input.supplierId, balanceType: input.balanceType, deltaMinorUnits: delta.toString() } });
        return adjustmentDto(row);
      });
    },

    async reverseAdjustment(organizationId, adjustmentId, body, actor, idempotencyKey) {
      await assertCapability(organizationId, 'suppliers', 'suppliers.actions.edit');
      const input = parseReverse(body);
      return execute('supplier-balances.adjustment.reverse', organizationId, actor, idempotencyKey, { adjustmentId, reason: input.reason }, async (session) => {
        const original = await store.findAdjustment(organizationId, adjustmentId, session);
        if (!original) throw notFound('Supplier balance adjustment not found');
        if (original.reversalOfId || await store.findAdjustmentReversal(organizationId, adjustmentId, session)) throw conflict('Supplier balance adjustment is already reversed');
        await ledgersService.lockSupplierFinancialPosition(session, organizationId, original.supplierId);
        const delta = -BigInt(original.deltaMinorUnits);
        if (original.balanceType === 'supplier_advance') {
          const current = await currentBalance(organizationId, original.supplierId, original.balanceType, session);
          if (current + delta < 0n) throw conflict('Adjustment reversal would make supplier advance negative');
        }
        if (original.balanceType === 'supplier_payable' && BigInt(original.deltaMinorUnits) > 0n) {
          const targets = await paymentsService.listSupplierPayableTargetsForAdjustment(organizationId, String(original.supplierId), session);
          const manual = targets.find((target) => target.targetType === 'supplier_manual_payable' && String(target.targetId) === String(original._id));
          if (!manual || BigInt(manual.outstandingMinorUnits) !== BigInt(original.deltaMinorUnits)) throw conflict('Manual supplier payable adjustment has dependent payments or corrections');
        }
        const reversalId = store.allocateId();
        const targetEffects = original.targetEffects.map((item) => ({ targetType: item.targetType, targetId: item.targetId, signedAmountMinorUnits: (-BigInt(item.signedAmountMinorUnits)).toString() }));
        const row = await store.insertAdjustment(session, { _id: reversalId, organizationId, supplierId: original.supplierId, balanceType: original.balanceType, expectedCurrentMinorUnits: original.desiredMinorUnits, desiredMinorUnits: original.expectedCurrentMinorUnits, deltaMinorUnits: delta.toString(), currency: 'PKR', reason: input.reason, category: 'reversal', businessDate: original.businessDate, reference: original.reference, notes: null, targetEffects, status: 'posted', reversalOfId: original._id, postedBy: actorId(actor) });
        const [ledger] = await ledgersService.listEffectsBySource(organizationId, sourceType(original.balanceType), adjustmentId, session);
        if (delta !== 0n) await postEffect(session, { organizationId, supplierId: original.supplierId, effectKind: effectKind(original.balanceType), signedAmountMinorUnits: delta.toString(), sourceType: 'supplier_balance_adjustment_reversal', sourceId: reversalId, reversalOfId: ledger?.id ?? null, postedBy: actorId(actor) });
        await audit.appendBusinessEvent(session, { organizationId, actorId: actorId(actor), action: 'supplier_balance_adjustment.reversed', resourceType: 'supplier_balance_adjustment', resourceId: String(reversalId), reason: input.reason, metadata: { reversalOfId: adjustmentId } });
        return adjustmentDto(row);
      }, 200);
    },

    async listManualPayableTargets(organizationId, supplierId, session) {
      const rows = await store.listPayableAdjustments(organizationId, supplierId, session);
      return rows.filter((row) => !row.reversalOfId && BigInt(row.deltaMinorUnits) > 0n).map((row) => ({ id: String(row._id), targetId: String(row._id), targetType: 'supplier_manual_payable', purchaseDate: row.businessDate, dueDate: null, sequence: String(row._id), reference: row.reference || 'Manual supplier payable adjustment', outstandingMinorUnits: '0' }));
    },
    async listPayableTargetAdjustments(organizationId, supplierId, session) {
      const rows = await store.listPayableAdjustments(organizationId, supplierId, session);
      return rows.flatMap((row) => row.targetEffects.map((item) => ({ targetType: item.targetType, targetId: String(item.targetId), signedAmountMinorUnits: String(item.signedAmountMinorUnits) })));
    },
    async assertPayableTargetUnadjusted(organizationId, supplierId, targetType, targetId, session) {
      const effects = await this.listPayableTargetAdjustments(organizationId, supplierId, session);
      const net = effects.filter((item) => item.targetType === targetType && String(item.targetId) === String(targetId)).reduce((sum, item) => sum + BigInt(item.signedAmountMinorUnits), 0n);
      if (net !== 0n) throw conflict('Supplier payable target has an active balance adjustment; reverse it first');
    },
  };
}

function createSupplierFinanceModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store = options.store ?? (persistence === 'mongoose' ? createMongooseSupplierFinanceStore() : createInMemorySupplierFinanceStore());
  const transactionRunner = options.transactionRunner ?? createTransactionRunner(options.sessionPort ?? (persistence === 'mongoose' ? mongooseSessionPort() : createMockTransactionSessionPort().port));
  const idempotency = options.idempotency ?? createIdempotencyService(options.idempotencyStore ?? (persistence === 'mongoose' ? createMongooseIdempotencyStore() : createInMemoryIdempotencyStore()));
  return { store, supplierFinanceService: createSupplierFinanceService({ ...options, store, transactionRunner, idempotency }) };
}

module.exports = { createSupplierFinanceModule, createSupplierFinanceService };
