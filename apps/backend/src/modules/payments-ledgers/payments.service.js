const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { allocateGeneralSupplierPayment } = require('./supplier-allocation');
const { allocateGeneralCustomerPayment } = require('./customer-allocation');
const {
  parseSupplierPayment,
  parseCustomerPayment,
  parsePaymentCorrect,
  toPaymentDto,
} = require('./payments.validation');
const { reconcileSupplierLedgerState } = require('./supplier-reconciliation');
const {
  formatMoneyMinorUnits,
  parseMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');

const SUPPLIER_PAYMENT_FIELD_CONTROLS = Object.freeze({
  supplierId: 'payments.supplier.fields.supplier',
  accountId: 'payments.supplier.fields.account',
  allocationMode: 'payments.supplier.fields.allocationMode',
  amount: 'payments.supplier.fields.amount',
  paymentDate: 'payments.supplier.fields.paymentDate',
  allocations: 'payments.supplier.fields.allocations',
  notes: 'payments.supplier.fields.notes',
});

const CUSTOMER_PAYMENT_FIELD_CONTROLS = Object.freeze({
  customerId: 'payments.customer.fields.customer',
  accountId: 'payments.customer.fields.account',
  allocationMode: 'payments.customer.fields.allocationMode',
  amount: 'payments.customer.fields.amount',
  paymentDate: 'payments.customer.fields.paymentDate',
  allocations: 'payments.customer.fields.allocations',
  notes: 'payments.customer.fields.notes',
});

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function negateMinorUnits(value) {
  return (-BigInt(String(value ?? '0'))).toString();
}

function wrapIdempotentResult(result) {
  return {
    replay: result.replay,
    data: result.response.body,
    statusCode: result.response.statusCode,
  };
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function allocationReversalSourceType(targetType) {
  if (targetType === 'sale' || targetType === 'customer_opening_receivable') {
    return 'customer_payment_allocation_reversal';
  }
  if (targetType === 'customer_advance') {
    return 'customer_payment_advance_reversal';
  }
  if (targetType === 'purchase' || targetType === 'supplier_opening_payable') {
    return 'supplier_payment_allocation_reversal';
  }
  return 'supplier_payment_advance_reversal';
}

function originalLedgerSourceType(targetType) {
  if (targetType === 'sale' || targetType === 'customer_opening_receivable') {
    return 'customer_payment_allocation';
  }
  if (targetType === 'customer_advance') {
    return 'customer_payment_advance';
  }
  if (targetType === 'purchase' || targetType === 'supplier_opening_payable') {
    return 'supplier_payment_allocation';
  }
  return 'supplier_payment_advance';
}

function originalLedgerSourceId(allocation, paymentId) {
  if (
    allocation.targetType === 'customer_advance' ||
    allocation.targetType === 'supplier_advance'
  ) {
    return paymentId;
  }
  return String(allocation['_id']);
}

function createPaymentsService(deps) {
  const store = deps.store;
  const ledgersService = deps.ledgersService;
  const accountsService = deps.accountsService;
  const suppliersService = deps.suppliersService;
  const customersService = deps.customersService;
  const listUnpaidSupplierPurchases = deps.listUnpaidSupplierPurchases;
  const listUnpaidCustomerSales = deps.listUnpaidCustomerSales;
  const transactionRunner = deps.transactionRunner;
  const now = deps.now ?? (() => new Date());
  const idempotency =
    deps.idempotency ??
    createIdempotencyService(
      deps.persistence === 'mongoose'
        ? createMongooseIdempotencyStore()
        : createInMemoryIdempotencyStore(),
    );
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });

  async function listCustomerReceivableTargets(organizationId, customerId, customer) {
    const targets =
      typeof listUnpaidCustomerSales === 'function'
        ? (await listUnpaidCustomerSales(organizationId, customerId)).map((item) => ({
            ...item,
            targetType: 'sale',
            targetId: String(item.id),
          }))
        : [];

    const opening = customer?.openingBalance;
    if (opening?.kind !== 'receivable' || !opening.ledgerEffectId) {
      return targets;
    }

    const openingTargetId = String(customerId);
    const allocations = await store.listAllocationsByTarget(
      organizationId,
      'customer_opening_receivable',
      openingTargetId,
    );
    const allocated = allocations.reduce(
      (sum, item) => sum + BigInt(String(item.allocatedAmountMinorUnits ?? '0')),
      0n,
    );
    const outstanding = parseMoneyMinorUnits(opening.amount?.amount ?? '0') - allocated;
    if (outstanding > 0n) {
      targets.push({
        id: `opening:${openingTargetId}`,
        targetType: 'customer_opening_receivable',
        targetId: openingTargetId,
        invoiceNumber: 'Opening receivable',
        invoiceDate: '0001-01-01',
        dueDate: null,
        sequence: '0',
        outstandingMinorUnits: outstanding.toString(),
      });
    }
    return targets;
  }

  async function listSupplierPayableTargets(organizationId, supplierId, supplier) {
    const targets =
      typeof listUnpaidSupplierPurchases === 'function'
        ? (await listUnpaidSupplierPurchases(organizationId, supplierId)).map((item) => ({
            ...item,
            targetType: 'purchase',
            targetId: String(item.id),
          }))
        : [];

    const opening = supplier?.openingBalance;
    if (opening?.kind !== 'payable' || !opening.ledgerEffectId) {
      return targets;
    }

    const openingTargetId = String(supplierId);
    const allocations = await store.listAllocationsByTarget(
      organizationId,
      'supplier_opening_payable',
      openingTargetId,
    );
    const allocated = allocations.reduce(
      (sum, item) => sum + BigInt(String(item.allocatedAmountMinorUnits ?? '0')),
      0n,
    );
    const outstanding = parseMoneyMinorUnits(opening.amount?.amount ?? '0') - allocated;
    if (outstanding > 0n) {
      targets.push({
        id: `opening:${openingTargetId}`,
        targetType: 'supplier_opening_payable',
        targetId: openingTargetId,
        purchaseDate: '0001-01-01',
        dueDate: null,
        sequence: '0',
        outstandingMinorUnits: outstanding.toString(),
      });
    }
    return targets;
  }

  async function assertSupplierPaymentFieldsEditable(organizationId, body) {
    if (
      !deps.capabilityService ||
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return;
    }
    for (const [field, controlKey] of Object.entries(SUPPLIER_PAYMENT_FIELD_CONTROLS)) {
      if (body[field] !== undefined) {
        await deps.capabilityService.assertAllowed(organizationId, controlKey, 'editable');
      }
    }
  }

  async function assertSupplierPaymentActionAllowed(organizationId, action) {
    if (!deps.capabilityService) return;
    await deps.capabilityService.assertAllowed(organizationId, 'payments.supplier', 'enabled');
    await deps.capabilityService.assertAllowed(
      organizationId,
      `payments.supplier.actions.${action}`,
      'allowed',
    );
  }

  async function assertCustomerPaymentFieldsEditable(organizationId, body) {
    if (
      !deps.capabilityService ||
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return;
    }
    for (const [field, controlKey] of Object.entries(CUSTOMER_PAYMENT_FIELD_CONTROLS)) {
      if (body[field] !== undefined) {
        await deps.capabilityService.assertAllowed(organizationId, controlKey, 'editable');
      }
    }
  }

  async function assertCustomerPaymentActionAllowed(organizationId, action) {
    if (!deps.capabilityService) return;
    await deps.capabilityService.assertAllowed(organizationId, 'payments.customer', 'enabled');
    await deps.capabilityService.assertAllowed(
      organizationId,
      `payments.customer.actions.${action}`,
      'allowed',
    );
  }

  async function assertInvoiceSpecificPaymentAllowed(organizationId, body) {
    if (!deps.capabilityService || body?.allocationMode !== 'invoice_specific') return;
    await deps.capabilityService.assertAllowed(
      organizationId,
      'payments.supplier.actions.postInvoiceSpecific',
      'allowed',
    );
  }

  async function assertCustomerInvoiceSpecificPaymentAllowed(organizationId, body) {
    if (!deps.capabilityService || body?.allocationMode !== 'invoice_specific') return;
    await deps.capabilityService.assertAllowed(
      organizationId,
      'payments.customer.actions.postInvoiceSpecific',
      'allowed',
    );
  }

  async function resolveCustomerAllocationPlan(input, unpaidSales) {
    const targetsById = new Map((unpaidSales ?? []).map((item) => [String(item.id), item]));
    if (input.allocationMode === 'invoice_specific') {
      let totalAllocated = 0n;
      for (const item of input.invoiceAllocations) {
        totalAllocated += BigInt(item.allocatedAmountMinorUnits);
      }
      const paymentAmount = BigInt(input.amountMinorUnits);
      if (totalAllocated > paymentAmount) {
        throw validationFailed('Allocated amount exceeds payment amount', [
          { field: 'allocations', message: 'allocations cannot exceed payment amount' },
        ]);
      }
      return {
        saleAllocations: input.invoiceAllocations.map((item) => {
          const target = targetsById.get(String(item.saleId));
          return {
            saleId: item.saleId,
            targetType: target?.targetType ?? 'sale',
            targetId: target?.targetId ?? item.saleId,
            allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
          };
        }),
        advanceAmountMinorUnits: (paymentAmount - totalAllocated).toString(),
      };
    }

    const plan = allocateGeneralCustomerPayment(unpaidSales ?? [], input.amountMinorUnits);
    return {
      saleAllocations: plan.allocations.map((item) => ({
        saleId: item.saleId,
        targetType: targetsById.get(String(item.saleId))?.targetType ?? 'sale',
        targetId: targetsById.get(String(item.saleId))?.targetId ?? item.saleId,
        allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
      })),
      advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
    };
  }

  async function resolveAllocationPlan(input, unpaidPurchases) {
    const targetsById = new Map((unpaidPurchases ?? []).map((item) => [String(item.id), item]));
    if (input.allocationMode === 'invoice_specific') {
      let totalAllocated = 0n;
      for (const item of input.invoiceAllocations) {
        totalAllocated += BigInt(item.allocatedAmountMinorUnits);
      }
      const paymentAmount = BigInt(input.amountMinorUnits);
      if (totalAllocated > paymentAmount) {
        throw validationFailed('Allocated amount exceeds payment amount', [
          { field: 'allocations', message: 'allocations cannot exceed payment amount' },
        ]);
      }
      return {
        purchaseAllocations: input.invoiceAllocations.map((item) => {
          const target = targetsById.get(String(item.purchaseId));
          return {
            purchaseId: item.purchaseId,
            targetType: target?.targetType ?? 'purchase',
            targetId: target?.targetId ?? item.purchaseId,
            allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
          };
        }),
        advanceAmountMinorUnits: (paymentAmount - totalAllocated).toString(),
      };
    }

    const plan = allocateGeneralSupplierPayment(unpaidPurchases ?? [], input.amountMinorUnits);
    return {
      purchaseAllocations: plan.allocations.map((item) => ({
        purchaseId: item.purchaseId,
        targetType: targetsById.get(String(item.purchaseId))?.targetType ?? 'purchase',
        targetId: targetsById.get(String(item.purchaseId))?.targetId ?? item.purchaseId,
        allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
      })),
      advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
    };
  }

  /**
   * Session-scoped supplier payment posting for Payments orchestration and later Purchases.
   * Creates payment, allocations, ledger effects. Optionally posts account movement when
   * Payments owns the workflow (standalone supplier payment).
   */
  async function postSupplierPaymentInSession(session, input) {
    const payment = await store.insertPayment(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      customerId: null,
      accountId: input.accountId,
      allocationMode: input.allocationMode,
      amountMinorUnits: input.amountMinorUnits,
      currency: input.currency ?? 'PKR',
      paymentDate: input.paymentDate,
      notes: input.notes ?? '',
      status: 'posted',
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });

    const paymentId = String(payment['_id']);
    const createdAllocations = [];

    for (const item of input.purchaseAllocations) {
      const targetType = item.targetType ?? 'purchase';
      const targetId = item.targetId ?? item.purchaseId;
      const allocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType,
        targetId,
        allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
        currency: input.currency ?? 'PKR',
        status: 'posted',
        postedAt: input.postedAt,
      });
      createdAllocations.push(allocation);

      await ledgersService.postLedgerEffect(session, {
        organizationId: input.organizationId,
        partyType: 'supplier',
        supplierId: input.supplierId,
        effectKind: 'payable',
        signedAmountMinorUnits: `-${item.allocatedAmountMinorUnits}`,
        currency: input.currency ?? 'PKR',
        sourceType: 'supplier_payment_allocation',
        sourceId: String(allocation['_id']),
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    const advanceAmount = BigInt(input.advanceAmountMinorUnits ?? '0');
    if (advanceAmount > 0n) {
      const advanceAllocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType: 'supplier_advance',
        targetId: paymentId,
        allocatedAmountMinorUnits: advanceAmount.toString(),
        currency: input.currency ?? 'PKR',
        status: 'posted',
        postedAt: input.postedAt,
      });
      createdAllocations.push(advanceAllocation);

      await ledgersService.postLedgerEffect(session, {
        organizationId: input.organizationId,
        partyType: 'supplier',
        supplierId: input.supplierId,
        effectKind: 'supplier_advance',
        signedAmountMinorUnits: advanceAmount.toString(),
        currency: input.currency ?? 'PKR',
        sourceType: 'supplier_payment_advance',
        sourceId: paymentId,
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    if (input.postAccountMovement === true) {
      if (!accountsService) {
        throw validationFailed('Accounts service is required to post payment account movements');
      }
      await accountsService.postAccountMovement(session, {
        organizationId: input.organizationId,
        accountId: input.accountId,
        signedAmountMinorUnits: `-${input.amountMinorUnits}`,
        currency: input.currency ?? 'PKR',
        sourceType: 'supplier_payment',
        sourceId: paymentId,
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    await auditWriter.appendBusinessEvent(session, {
      organizationId: input.organizationId,
      actorId: input.postedBy,
      action: 'supplier_payment.posted',
      resourceType: 'payment',
      resourceId: paymentId,
      metadata: {
        supplierId: input.supplierId,
        accountId: input.accountId,
        amountMinorUnits: input.amountMinorUnits,
        allocationMode: input.allocationMode,
        advanceAmountMinorUnits: advanceAmount.toString(),
      },
    });

    return { payment, allocations: createdAllocations };
  }

  /**
   * Session-scoped payable effect for later purchase posting orchestration.
   */
  async function postSupplierPayableEffect(session, input) {
    return ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      effectKind: 'payable',
      signedAmountMinorUnits: String(input.signedAmountMinorUnits),
      currency: input.currency ?? 'PKR',
      sourceType: input.sourceType ?? 'purchase_payable',
      sourceId: input.sourceId,
      reversalOfId: input.reversalOfId ?? null,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
  }

  async function applySupplierAdvanceInSession(session, input) {
    const amount = BigInt(String(input.amountMinorUnits ?? '0'));
    if (amount <= 0n) {
      return { payableEffect: null, advanceEffect: null };
    }
    const payableEffect = await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      effectKind: 'payable',
      signedAmountMinorUnits: `-${amount.toString()}`,
      currency: input.currency ?? 'PKR',
      sourceType: 'supplier_advance_application',
      sourceId: input.purchaseId,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    const advanceEffect = await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      effectKind: 'supplier_advance',
      signedAmountMinorUnits: `-${amount.toString()}`,
      currency: input.currency ?? 'PKR',
      sourceType: 'supplier_advance_consumption',
      sourceId: input.purchaseId,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    return { payableEffect, advanceEffect };
  }

  async function reverseSupplierAdvanceApplicationInSession(session, input) {
    const [payableEffects, advanceEffects] = await Promise.all([
      ledgersService.listEffectsBySource(
        input.organizationId,
        'supplier_advance_application',
        input.purchaseId,
        session,
      ),
      ledgersService.listEffectsBySource(
        input.organizationId,
        'supplier_advance_consumption',
        input.purchaseId,
        session,
      ),
    ]);
    const payableEffect = payableEffects[0];
    const advanceEffect = advanceEffects[0];
    if (!payableEffect || !advanceEffect) {
      return null;
    }
    const amount = -BigInt(String(advanceEffect.signedAmountMinorUnits));
    await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      effectKind: 'payable',
      signedAmountMinorUnits: amount.toString(),
      currency: input.currency ?? 'PKR',
      sourceType: 'purchase_cancellation_advance_payable_reversal',
      sourceId: input.purchaseId,
      reversalOfId: payableEffect.id ?? payableEffect['_id'],
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'supplier',
      supplierId: input.supplierId,
      effectKind: 'supplier_advance',
      signedAmountMinorUnits: amount.toString(),
      currency: input.currency ?? 'PKR',
      sourceType: 'purchase_cancellation_advance_reinstatement',
      sourceId: input.purchaseId,
      reversalOfId: advanceEffect.id ?? advanceEffect['_id'],
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    return amount.toString();
  }

  async function postCustomerPaymentInSession(session, input) {
    const payment = await store.insertPayment(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      supplierId: null,
      customerId: input.customerId,
      accountId: input.accountId,
      allocationMode: input.allocationMode,
      amountMinorUnits: input.amountMinorUnits,
      currency: input.currency ?? 'PKR',
      paymentDate: input.paymentDate,
      notes: input.notes ?? '',
      status: 'posted',
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });

    const paymentId = String(payment['_id']);
    const createdAllocations = [];

    for (const item of input.saleAllocations) {
      const targetType = item.targetType ?? 'sale';
      const targetId = item.targetId ?? item.saleId;
      const allocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType,
        targetId,
        allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
        currency: input.currency ?? 'PKR',
        status: 'posted',
        postedAt: input.postedAt,
      });
      createdAllocations.push(allocation);

      await ledgersService.postLedgerEffect(session, {
        organizationId: input.organizationId,
        partyType: 'customer',
        customerId: input.customerId,
        effectKind: 'receivable',
        signedAmountMinorUnits: `-${item.allocatedAmountMinorUnits}`,
        currency: input.currency ?? 'PKR',
        sourceType: 'customer_payment_allocation',
        sourceId: String(allocation['_id']),
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    const advanceAmount = BigInt(input.advanceAmountMinorUnits ?? '0');
    if (advanceAmount > 0n) {
      const advanceAllocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType: 'customer_advance',
        targetId: paymentId,
        allocatedAmountMinorUnits: advanceAmount.toString(),
        currency: input.currency ?? 'PKR',
        status: 'posted',
        postedAt: input.postedAt,
      });
      createdAllocations.push(advanceAllocation);

      await ledgersService.postLedgerEffect(session, {
        organizationId: input.organizationId,
        partyType: 'customer',
        customerId: input.customerId,
        effectKind: 'advance',
        signedAmountMinorUnits: advanceAmount.toString(),
        currency: input.currency ?? 'PKR',
        sourceType: 'customer_payment_advance',
        sourceId: paymentId,
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    if (input.postAccountMovement === true) {
      if (!accountsService) {
        throw validationFailed('Accounts service is required to post payment account movements');
      }
      await accountsService.postAccountMovement(session, {
        organizationId: input.organizationId,
        accountId: input.accountId,
        signedAmountMinorUnits: String(input.amountMinorUnits),
        currency: input.currency ?? 'PKR',
        sourceType: 'customer_payment',
        sourceId: paymentId,
        postedAt: input.postedAt,
        postedBy: input.postedBy,
      });
    }

    await auditWriter.appendBusinessEvent(session, {
      organizationId: input.organizationId,
      actorId: input.postedBy,
      action: 'customer_payment.posted',
      resourceType: 'payment',
      resourceId: paymentId,
      metadata: {
        customerId: input.customerId,
        accountId: input.accountId,
        amountMinorUnits: input.amountMinorUnits,
        allocationMode: input.allocationMode,
        advanceAmountMinorUnits: advanceAmount.toString(),
      },
    });

    return { payment, allocations: createdAllocations };
  }

  async function postCustomerReceivableEffect(session, input) {
    return ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      customerId: input.customerId,
      effectKind: 'receivable',
      signedAmountMinorUnits: String(input.signedAmountMinorUnits),
      currency: input.currency ?? 'PKR',
      sourceType: input.sourceType ?? 'sale_receivable',
      sourceId: input.sourceId,
      reversalOfId: input.reversalOfId ?? null,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
  }

  async function applyCustomerAdvanceInSession(session, input) {
    const amount = BigInt(String(input.amountMinorUnits ?? '0'));
    if (amount <= 0n) {
      return { receivableEffect: null, advanceEffect: null };
    }
    const receivableEffect = await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      customerId: input.customerId,
      effectKind: 'receivable',
      signedAmountMinorUnits: `-${amount.toString()}`,
      currency: input.currency ?? 'PKR',
      sourceType: 'customer_advance_application',
      sourceId: input.saleId,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    const advanceEffect = await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      customerId: input.customerId,
      effectKind: 'advance',
      signedAmountMinorUnits: `-${amount.toString()}`,
      currency: input.currency ?? 'PKR',
      sourceType: 'customer_advance_consumption',
      sourceId: input.saleId,
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    return { receivableEffect, advanceEffect };
  }

  async function reverseCustomerAdvanceApplicationInSession(session, input) {
    const [receivableEffects, advanceEffects] = await Promise.all([
      ledgersService.listEffectsBySource(
        input.organizationId,
        'customer_advance_application',
        input.saleId,
        session,
      ),
      ledgersService.listEffectsBySource(
        input.organizationId,
        'customer_advance_consumption',
        input.saleId,
        session,
      ),
    ]);
    const receivableEffect = receivableEffects[0];
    const advanceEffect = advanceEffects[0];
    if (!receivableEffect || !advanceEffect) {
      return null;
    }
    const amount = -BigInt(String(advanceEffect.signedAmountMinorUnits));
    await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      customerId: input.customerId,
      effectKind: 'receivable',
      signedAmountMinorUnits: amount.toString(),
      currency: input.currency ?? 'PKR',
      sourceType: 'sale_cancellation_advance_receivable_reversal',
      sourceId: input.saleId,
      reversalOfId: receivableEffect.id ?? receivableEffect['_id'],
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    await ledgersService.postLedgerEffect(session, {
      organizationId: input.organizationId,
      partyType: 'customer',
      customerId: input.customerId,
      effectKind: 'advance',
      signedAmountMinorUnits: amount.toString(),
      currency: input.currency ?? 'PKR',
      sourceType: 'sale_cancellation_advance_reinstatement',
      sourceId: input.saleId,
      reversalOfId: advanceEffect.id ?? advanceEffect['_id'],
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
    return amount.toString();
  }

  return {
    allocateGeneralSupplierPayment,
    allocateGeneralCustomerPayment,
    postSupplierPaymentInSession,
    postSupplierPayableEffect,
    applySupplierAdvanceInSession,
    reverseSupplierAdvanceApplicationInSession,
    postCustomerPaymentInSession,
    postCustomerReceivableEffect,
    applyCustomerAdvanceInSession,
    reverseCustomerAdvanceApplicationInSession,

    async listLedgerEffectsBySource(organizationId, sourceType, sourceId, session) {
      return ledgersService.listEffectsBySource(organizationId, sourceType, sourceId, session);
    },

    async listPurchaseAllocations(organizationId, purchaseId) {
      return store.listAllocationsByTarget(organizationId, 'purchase', purchaseId);
    },

    async getSupplierPaymentRaw(organizationId, paymentId) {
      return store.findPaymentById(organizationId, paymentId);
    },

    async getCustomerPaymentRaw(organizationId, paymentId) {
      return store.findPaymentById(organizationId, paymentId);
    },

    async sumCustomerReceivable(organizationId, customerId) {
      return ledgersService.sumCustomerReceivable(organizationId, customerId);
    },

    async sumCustomerAdvance(organizationId, customerId) {
      return ledgersService.sumCustomerAdvance(organizationId, customerId);
    },

    async sumSupplierPayable(organizationId, supplierId) {
      return ledgersService.sumSupplierPayable(organizationId, supplierId);
    },

    async sumSupplierAdvance(organizationId, supplierId, session) {
      return ledgersService.sumSupplierAdvance(organizationId, supplierId, session);
    },

    async listCustomerReceivableBalances(organizationId) {
      return ledgersService.listCustomerReceivableBalances(organizationId);
    },

    async listCustomerAdvanceBalances(organizationId) {
      return ledgersService.listCustomerAdvanceBalances(organizationId);
    },

    async listSupplierPayableBalances(organizationId) {
      return ledgersService.listSupplierPayableBalances(organizationId);
    },

    async listSupplierAdvanceBalances(organizationId) {
      return ledgersService.listSupplierAdvanceBalances(organizationId);
    },

    async listUnpaidPurchasesForSupplier(organizationId, supplierId) {
      const supplier = suppliersService
        ? await suppliersService.getSupplier(organizationId, supplierId)
        : null;
      const items = await listSupplierPayableTargets(organizationId, supplierId, supplier);
      return {
        items: items.map((item) => ({
          id: String(item.id),
          targetType: item.targetType ?? 'purchase',
          purchaseDate: String(item.purchaseDate),
          dueDate: item.dueDate ?? null,
          sequence: item.sequence ?? null,
          outstanding: {
            amount: formatMoneyMinorUnits(BigInt(String(item.outstandingMinorUnits ?? '0'))),
            currency: 'PKR',
          },
          outstandingMinorUnits: String(item.outstandingMinorUnits ?? '0'),
        })),
      };
    },

    async listSupplierLedgerSuppliers(organizationId, search = '') {
      if (!suppliersService || typeof suppliersService.listSuppliers !== 'function') {
        return { items: [] };
      }
      const result = await suppliersService.listSuppliers(organizationId, {
        status: 'active',
        search: String(search ?? '').trim(),
        skip: 0,
        pageSize: 25,
      });
      return {
        items: (result.items ?? []).map((supplier) => ({
          id: String(supplier.id),
          organizationId: String(supplier.organizationId),
          name: String(supplier.name),
          contactName: supplier.contactName ?? null,
          phone: supplier.phone ?? null,
          email: supplier.email ?? null,
          status: String(supplier.status),
          version: Number(supplier.version),
        })),
      };
    },

    async listSupplierPayments(organizationId, query = {}) {
      const { items, total } = await store.listPaymentsPage(
        organizationId,
        {
          partyType: 'supplier',
          supplierId: query.supplierId,
          paymentDate: query.paymentDate,
          fromDate: query.fromDate,
          toDate: query.toDate,
          search: query.search,
        },
        { skip: query.skip, pageSize: query.pageSize },
      );
      const mapped = [];
      for (const item of items) {
        const allocations = await store.listAllocationsByPayment(
          organizationId,
          String(item['_id']),
        );
        mapped.push(toPaymentDto(item, allocations));
      }
      return { items: mapped, total };
    },

    async getSupplierPayment(organizationId, paymentId) {
      const payment = await store.findPaymentById(organizationId, paymentId);
      if (payment === null || payment.partyType !== 'supplier') {
        throw notFound('Supplier payment not found');
      }
      const allocations = await store.listAllocationsByPayment(organizationId, paymentId);
      return toPaymentDto(payment, allocations);
    },

    async listSupplierLedger(organizationId, supplierId) {
      if (suppliersService) {
        await suppliersService.getSupplier(organizationId, supplierId);
      }
      return ledgersService.listSupplierEffects(organizationId, supplierId);
    },

    async reconcileSupplierLedger(organizationId, supplierId, options = {}) {
      if (suppliersService) {
        await suppliersService.getSupplier(organizationId, supplierId);
      }

      const ledger = await ledgersService.listSupplierEffects(organizationId, supplierId);
      const payments = await store.listPayments(organizationId, { supplierId });
      const allocations = [];
      for (const payment of payments) {
        const items = await store.listAllocationsByPayment(organizationId, String(payment['_id']));
        for (const item of items) {
          allocations.push(item);
        }
      }

      const effects = (ledger.items ?? []).map((item) => ({
        status: item.status,
        effectKind: item.effectKind,
        sourceType: item.sourceType,
        signedAmountMinorUnits: parseMoneyMinorUnits(String(item.signedAmount.amount)).toString(),
      }));

      let accountMovements = [];
      if (accountsService && typeof accountsService.listAccountMovements === 'function') {
        const accountIds = [...new Set(payments.map((item) => String(item.accountId)))];
        for (const accountId of accountIds) {
          const movements = await accountsService.listAccountMovements(organizationId, accountId);
          for (const movement of movements.items ?? movements ?? []) {
            accountMovements.push({
              status: movement.status,
              sourceType: movement.sourceType,
              sourceId: movement.sourceId ?? movement.id,
              signedAmountMinorUnits: parseMoneyMinorUnits(
                String(movement.signedAmount?.amount ?? movement.amount?.amount ?? '0'),
              ).toString(),
            });
          }
        }
        const paymentIds = new Set(payments.map((item) => String(item['_id'])));
        const allocationIds = new Set(allocations.map((item) => String(item['_id'])));
        accountMovements = accountMovements.filter((item) => {
          const sourceId = String(item.sourceId);
          return (
            paymentIds.has(sourceId) ||
            allocationIds.has(sourceId) ||
            String(item.sourceType) === 'purchase_cancellation_refund' ||
            String(item.sourceType) === 'purchase_return_refund'
          );
        });
      }

      const result = reconcileSupplierLedgerState({
        effects,
        allocations,
        accountMovements,
        expectedPayableMinorUnits: options.expectedPayableMinorUnits,
        expectedAdvanceMinorUnits: options.expectedAdvanceMinorUnits,
        expectedAllocationTotalMinorUnits: options.expectedAllocationTotalMinorUnits,
        expectedAccountMovementTotalMinorUnits: options.expectedAccountMovementTotalMinorUnits,
        detectInternalInconsistency: options.detectInternalInconsistency !== false,
      });

      return {
        supplierId,
        ok: result.ok,
        payable: {
          amount: formatMoneyMinorUnits(BigInt(result.payableMinorUnits)),
          currency: 'PKR',
        },
        advance: {
          amount: formatMoneyMinorUnits(BigInt(result.advanceMinorUnits)),
          currency: 'PKR',
        },
        netPayable: {
          amount: formatMoneyMinorUnits(BigInt(result.netPayableMinorUnits)),
          currency: 'PKR',
        },
        allocationTotal: {
          amount: formatMoneyMinorUnits(BigInt(result.allocationTotalMinorUnits)),
          currency: 'PKR',
        },
        accountMovementTotal: {
          amount: formatMoneyMinorUnits(BigInt(result.accountMovementTotalMinorUnits)),
          currency: 'PKR',
        },
        findings: result.findings,
      };
    },

    async postSupplierPayment(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      await assertSupplierPaymentActionAllowed(organizationId, 'post');
      await assertSupplierPaymentFieldsEditable(organizationId, body);
      await assertInvoiceSpecificPaymentAllowed(organizationId, body);
      const input = parseSupplierPayment(body);

      if (!suppliersService) {
        throw validationFailed('Suppliers service is required');
      }
      if (!accountsService) {
        throw validationFailed('Accounts service is required');
      }

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'supplier-payments.post',
        },
        key,
        {
          supplierId: input.supplierId,
          accountId: input.accountId,
          amountMinorUnits: input.amountMinorUnits,
          paymentDate: input.paymentDate,
          allocationMode: input.allocationMode,
          invoiceAllocations: input.invoiceAllocations,
          notes: input.notes,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const supplier = await suppliersService.getSupplier(organizationId, input.supplierId);
            if (supplier.status !== 'active') {
              throw validationFailed('Supplier must be active', [
                { field: 'supplierId', message: 'supplier must be active' },
              ]);
            }

            const account = await accountsService.getAccount(organizationId, input.accountId);
            if (account.status !== 'active') {
              throw validationFailed('Account must be active', [
                { field: 'accountId', message: 'account must be active' },
              ]);
            }

            let unpaidPurchases = [];
            let unpaidById = new Map();

            if (input.allocationMode === 'general') {
              unpaidPurchases = await listSupplierPayableTargets(
                organizationId,
                input.supplierId,
                supplier,
              );
              unpaidById = new Map(unpaidPurchases.map((item) => [String(item.id), item]));
            }

            if (input.allocationMode === 'invoice_specific') {
              unpaidPurchases = await listSupplierPayableTargets(
                organizationId,
                input.supplierId,
                supplier,
              );
              unpaidById = new Map(unpaidPurchases.map((item) => [String(item.id), item]));
              for (const allocation of input.invoiceAllocations) {
                const unpaid = unpaidById.get(allocation.purchaseId);
                if (!unpaid) {
                  throw validationFailed('Purchase is not an unpaid payable target', [
                    {
                      field: 'allocations',
                      message: `purchase ${allocation.purchaseId} has no outstanding payable`,
                    },
                  ]);
                }
                if (
                  BigInt(allocation.allocatedAmountMinorUnits) >
                  BigInt(unpaid.outstandingMinorUnits)
                ) {
                  throw validationFailed('Allocation exceeds outstanding purchase payable', [
                    {
                      field: 'allocations',
                      message: `allocation for ${allocation.purchaseId} exceeds outstanding`,
                    },
                  ]);
                }
              }
            }

            // Pre-fetch prior allocation totals so post-check can compute purchaseTotal.
            const priorAllocTotals = new Map();
            if (input.allocationMode === 'invoice_specific') {
              for (const item of input.invoiceAllocations) {
                const target = unpaidById.get(String(item.purchaseId));
                if (target?.targetType !== 'purchase') {
                  continue;
                }
                const existing = await store.listAllocationsByTarget(
                  organizationId,
                  'purchase',
                  target.targetId,
                );
                const total = existing.reduce(
                  (sum, a) => sum + BigInt(a.allocatedAmountMinorUnits),
                  0n,
                );
                priorAllocTotals.set(String(item.purchaseId), total);
              }
            }

            const plan = await resolveAllocationPlan(input, unpaidPurchases);
            const postedAt = now();

            let posted;
            try {
              posted = await postSupplierPaymentInSession(session, {
                organizationId,
                supplierId: input.supplierId,
                accountId: input.accountId,
                amountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                paymentDate: input.paymentDate,
                allocationMode: input.allocationMode,
                purchaseAllocations: plan.purchaseAllocations,
                advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
                notes: input.notes,
                postedAt,
                postedBy: actor.actorId,
                postAccountMovement: true,
              });
            } catch (error) {
              mapDuplicate(error, 'Supplier payment effects already exist for this source');
            }

            // Post-allocation outstanding validation for invoice-specific payments.
            if (input.allocationMode === 'invoice_specific') {
              for (const alloc of plan.purchaseAllocations) {
                const purchaseUnpaid = unpaidById.get(String(alloc.purchaseId));
                if (!purchaseUnpaid) {
                  continue;
                }
                const priorTotal = priorAllocTotals.get(String(alloc.purchaseId)) ?? 0n;
                const purchaseTotal = priorTotal + BigInt(purchaseUnpaid.outstandingMinorUnits);
                const currentAllocs = await store.listAllocationsByTarget(
                  organizationId,
                  'purchase',
                  alloc.purchaseId,
                );
                const currentTotal = currentAllocs.reduce(
                  (sum, a) => sum + BigInt(a.allocatedAmountMinorUnits),
                  0n,
                );
                if (currentTotal > purchaseTotal) {
                  throw conflict('Payment allocation exceeds outstanding payable');
                }
              }
            }

            return toPaymentDto(posted.payment, posted.allocations);
          });

          return { statusCode: 201, body: dto };
        },
      );

      return {
        replay: result.replay,
        data: result.response.body,
        statusCode: result.response.statusCode,
      };
    },

    async correctPayment(organizationId, paymentId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parsePaymentCorrect(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'payments.correct',
        },
        key,
        { paymentId, reason: input.reason, replacement: input.replacement },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const original = await store.findPaymentById(organizationId, paymentId);
            if (original === null) {
              throw notFound('Payment not found');
            }
            if (original.partyType === 'supplier') {
              await assertSupplierPaymentActionAllowed(organizationId, 'correct');
              await assertSupplierPaymentFieldsEditable(organizationId, input.replacement);
              await assertInvoiceSpecificPaymentAllowed(organizationId, input.replacement);
            }
            if (original.partyType === 'customer') {
              await assertCustomerPaymentActionAllowed(organizationId, 'correct');
              await assertCustomerPaymentFieldsEditable(organizationId, input.replacement);
              await assertCustomerInvoiceSpecificPaymentAllowed(organizationId, input.replacement);
            }
            if (original.correctionOfId) {
              throw conflict('Corrective payments cannot be corrected again');
            }
            const existing = await store.findPaymentByCorrectionOfId(
              organizationId,
              String(original['_id']),
              session,
            );
            if (existing !== null) {
              throw conflict('Payment has already been corrected');
            }

            const postedAt = now();
            let reversalPayment;
            try {
              reversalPayment = await store.insertPayment(session, {
                organizationId,
                partyType: original.partyType,
                supplierId: original.supplierId ?? null,
                customerId: original.customerId ?? null,
                accountId: original.accountId,
                allocationMode: original.allocationMode,
                amountMinorUnits: original.amountMinorUnits,
                currency: original.currency ?? 'PKR',
                paymentDate: original.paymentDate,
                notes: original.notes ?? '',
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                correctionOfId: original['_id'],
                reason: input.reason,
              });
            } catch (error) {
              mapDuplicate(error, 'Payment has already been corrected');
            }

            const reversalPaymentId = String(reversalPayment['_id']);
            const originalPaymentId = String(original['_id']);
            const allocations = await store.listAllocationsByPayment(
              organizationId,
              originalPaymentId,
            );

            for (const allocation of allocations) {
              const reversalAllocation = await store.insertAllocation(session, {
                organizationId,
                paymentId: reversalPaymentId,
                targetType: allocation.targetType,
                targetId: allocation.targetId,
                allocatedAmountMinorUnits: allocation.allocatedAmountMinorUnits,
                currency: allocation.currency ?? 'PKR',
                status: 'posted',
                postedAt,
              });

              const originalSourceType = originalLedgerSourceType(allocation.targetType);
              const originalSourceId = originalLedgerSourceId(allocation, originalPaymentId);
              const originalEffects = await ledgersService.listEffectsBySource(
                organizationId,
                originalSourceType,
                originalSourceId,
                session,
              );
              const originalEffect = originalEffects[0];
              const signedAmount = originalEffect
                ? negateMinorUnits(originalEffect.signedAmountMinorUnits)
                : original.partyType === 'customer' &&
                    (allocation.targetType === 'sale' ||
                      allocation.targetType === 'customer_opening_receivable')
                  ? String(allocation.allocatedAmountMinorUnits)
                  : original.partyType === 'customer'
                    ? negateMinorUnits(allocation.allocatedAmountMinorUnits)
                    : allocation.targetType === 'purchase' ||
                        allocation.targetType === 'supplier_opening_payable'
                      ? String(allocation.allocatedAmountMinorUnits)
                      : negateMinorUnits(allocation.allocatedAmountMinorUnits);

              await ledgersService.postLedgerEffect(session, {
                organizationId,
                partyType: original.partyType,
                customerId: original.customerId,
                supplierId: original.supplierId,
                effectKind:
                  originalEffect?.effectKind ??
                  (allocation.targetType === 'sale' ||
                  allocation.targetType === 'customer_opening_receivable' ||
                  allocation.targetType === 'purchase' ||
                  allocation.targetType === 'supplier_opening_payable'
                    ? original.partyType === 'customer'
                      ? 'receivable'
                      : 'payable'
                    : original.partyType === 'customer'
                      ? 'advance'
                      : 'supplier_advance'),
                signedAmountMinorUnits: signedAmount,
                currency: original.currency ?? 'PKR',
                sourceType: allocationReversalSourceType(allocation.targetType),
                sourceId:
                  allocation.targetType === 'customer_advance' ||
                  allocation.targetType === 'supplier_advance'
                    ? reversalPaymentId
                    : String(reversalAllocation['_id']),
                reversalOfId: originalEffect?.id ?? null,
                postedAt,
                postedBy: actor.actorId,
              });
            }

            if (
              accountsService &&
              typeof accountsService.listAccountMovementsBySource === 'function'
            ) {
              const sourceTypes =
                original.partyType === 'customer'
                  ? ['customer_payment']
                  : ['supplier_payment', 'purchase_payment'];
              for (const sourceType of sourceTypes) {
                const movements = await accountsService.listAccountMovementsBySource(
                  organizationId,
                  sourceType,
                  originalPaymentId,
                  session,
                );
                for (const movement of movements) {
                  await accountsService.postAccountMovement(session, {
                    organizationId,
                    accountId: movement.accountId,
                    signedAmountMinorUnits: negateMinorUnits(movement.signedAmountMinorUnits),
                    currency: movement.currency ?? 'PKR',
                    sourceType:
                      original.partyType === 'customer'
                        ? 'customer_payment_correction'
                        : 'supplier_payment_correction',
                    sourceId: reversalPaymentId,
                    reversalOfId: movement.id,
                    postedAt,
                    postedBy: actor.actorId,
                  });
                }
              }
            }

            let replacementDto = null;
            if (input.replacement !== null) {
              if (original.partyType === 'customer') {
                const replacementInput = parseCustomerPayment({
                  customerId: String(original.customerId),
                  ...input.replacement,
                  accountId: input.replacement.accountId ?? String(original.accountId),
                });
                const replacementCustomer = await customersService.getCustomer(
                  organizationId,
                  replacementInput.customerId,
                );
                const unpaidSales = await listCustomerReceivableTargets(
                  organizationId,
                  replacementInput.customerId,
                  replacementCustomer,
                );
                const plan = await resolveCustomerAllocationPlan(replacementInput, unpaidSales);
                const postedReplacement = await postCustomerPaymentInSession(session, {
                  organizationId,
                  customerId: replacementInput.customerId,
                  accountId: replacementInput.accountId,
                  amountMinorUnits: replacementInput.amountMinorUnits,
                  currency: replacementInput.currency,
                  paymentDate: replacementInput.paymentDate,
                  allocationMode: replacementInput.allocationMode,
                  saleAllocations: plan.saleAllocations,
                  advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
                  notes: replacementInput.notes,
                  postedAt,
                  postedBy: actor.actorId,
                  postAccountMovement: true,
                });
                replacementDto = toPaymentDto(
                  postedReplacement.payment,
                  postedReplacement.allocations,
                );
                await store.updatePayment(session, organizationId, reversalPaymentId, {
                  replacementPaymentId: postedReplacement.payment['_id'],
                });
                reversalPayment.replacementPaymentId = postedReplacement.payment['_id'];
              } else {
                const replacementInput = parseSupplierPayment({
                  supplierId: String(original.supplierId),
                  ...input.replacement,
                  accountId: input.replacement.accountId ?? String(original.accountId),
                });
                const replacementSupplier = await suppliersService.getSupplier(
                  organizationId,
                  replacementInput.supplierId,
                );
                const unpaidPurchases = await listSupplierPayableTargets(
                  organizationId,
                  replacementInput.supplierId,
                  replacementSupplier,
                );
                const plan = await resolveAllocationPlan(replacementInput, unpaidPurchases);
                const postedReplacement = await postSupplierPaymentInSession(session, {
                  organizationId,
                  supplierId: replacementInput.supplierId,
                  accountId: replacementInput.accountId,
                  amountMinorUnits: replacementInput.amountMinorUnits,
                  currency: replacementInput.currency,
                  paymentDate: replacementInput.paymentDate,
                  allocationMode: replacementInput.allocationMode,
                  purchaseAllocations: plan.purchaseAllocations,
                  advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
                  notes: replacementInput.notes,
                  postedAt,
                  postedBy: actor.actorId,
                  postAccountMovement: true,
                });
                replacementDto = toPaymentDto(
                  postedReplacement.payment,
                  postedReplacement.allocations,
                );
                await store.updatePayment(session, organizationId, reversalPaymentId, {
                  replacementPaymentId: postedReplacement.payment['_id'],
                });
                reversalPayment.replacementPaymentId = postedReplacement.payment['_id'];
              }
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'payment.corrected',
              resourceType: 'payment',
              resourceId: originalPaymentId,
              reason: input.reason,
              metadata: {
                reversalPaymentId,
                partyType: original.partyType,
                replacementPaymentId: replacementDto?.id ?? null,
              },
            });

            const reversalAllocations = await store.listAllocationsByPayment(
              organizationId,
              reversalPaymentId,
            );
            return {
              original: toPaymentDto(original, allocations),
              reversal: toPaymentDto(reversalPayment, reversalAllocations),
              replacement: replacementDto,
            };
          });
          return { statusCode: 200, body: dto };
        },
      );
      return wrapIdempotentResult(result);
    },

    async listSaleAllocations(organizationId, saleId) {
      return store.listAllocationsByTarget(organizationId, 'sale', saleId);
    },

    async listCustomerPayments(organizationId, query = {}) {
      const { items, total } = await store.listPaymentsPage(
        organizationId,
        {
          partyType: 'customer',
          customerId: query.customerId,
          paymentDate: query.paymentDate,
          fromDate: query.fromDate,
          toDate: query.toDate,
          search: query.search,
        },
        { skip: query.skip, pageSize: query.pageSize },
      );

      // Batch-resolve allocations for the page (sequential per payment, as before)
      const itemsWithAllocations = [];
      for (const item of items) {
        const allocations = await store.listAllocationsByPayment(
          organizationId,
          String(item['_id']),
        );
        itemsWithAllocations.push({ item, allocations });
      }

      // Batch-resolve customer summaries in a single query
      const customerIdSet = new Set();
      for (const { item } of itemsWithAllocations) {
        if (item['customerId']) {
          customerIdSet.add(String(item['customerId']));
        }
      }
      const customerSummaries = customersService
        ? await customersService.listCustomerSummariesByIds(organizationId, [...customerIdSet])
        : [];
      const customerMap = new Map(customerSummaries.map((c) => [String(c.id), c]));

      const mapped = itemsWithAllocations.map(({ item, allocations }) => {
        const customer = item['customerId']
          ? (customerMap.get(String(item['customerId'])) ?? null)
          : null;
        return toPaymentDto(item, allocations, customer);
      });
      return { items: mapped, total };
    },

    async getCustomerPayment(organizationId, paymentId) {
      const payment = await store.findPaymentById(organizationId, paymentId);
      if (payment === null || payment.partyType !== 'customer') {
        throw notFound('Customer payment not found');
      }
      const allocations = await store.listAllocationsByPayment(organizationId, paymentId);
      const customer =
        customersService && payment['customerId']
          ? await customersService
              .listCustomerSummariesByIds(organizationId, [String(payment['customerId'])])
              .then((list) => list[0] ?? null)
          : null;
      return toPaymentDto(payment, allocations, customer);
    },

    async listCustomerLedger(organizationId, customerId) {
      if (customersService) {
        await customersService.getCustomer(organizationId, customerId);
      }
      return ledgersService.listCustomerEffects(organizationId, customerId);
    },

    async listUnpaidSalesForCustomer(organizationId, customerId) {
      const customer = customersService
        ? await customersService.getCustomer(organizationId, customerId)
        : null;
      const items = await listCustomerReceivableTargets(organizationId, customerId, customer);
      return {
        items: items.map((item) => ({
          id: String(item.id),
          targetType: item.targetType ?? 'sale',
          invoiceNumber: item.invoiceNumber ?? null,
          invoiceDate: String(item.invoiceDate),
          dueDate: item.dueDate ?? null,
          sequence: item.sequence ?? null,
          outstanding: {
            amount: formatMoneyMinorUnits(BigInt(String(item.outstandingMinorUnits ?? '0'))),
            currency: 'PKR',
          },
          outstandingMinorUnits: String(item.outstandingMinorUnits ?? '0'),
        })),
      };
    },

    async postCustomerPayment(organizationId, body, actor, idempotencyKey) {
      await assertCustomerPaymentActionAllowed(organizationId, 'post');
      await assertCustomerPaymentFieldsEditable(organizationId, body);
      await assertCustomerInvoiceSpecificPaymentAllowed(organizationId, body);
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseCustomerPayment(body);

      if (!customersService) {
        throw validationFailed('Customers service is required');
      }
      if (!accountsService) {
        throw validationFailed('Accounts service is required');
      }

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'customer-payments.post',
        },
        key,
        {
          customerId: input.customerId,
          accountId: input.accountId,
          amountMinorUnits: input.amountMinorUnits,
          paymentDate: input.paymentDate,
          allocationMode: input.allocationMode,
          invoiceAllocations: input.invoiceAllocations,
          notes: input.notes,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const customer = await customersService.getCustomer(organizationId, input.customerId);
            if (customer.status !== 'active') {
              throw validationFailed('Customer must be active', [
                { field: 'customerId', message: 'customer must be active' },
              ]);
            }

            const account = await accountsService.getAccount(organizationId, input.accountId);
            if (account.status !== 'active') {
              throw validationFailed('Account must be active', [
                { field: 'accountId', message: 'account must be active' },
              ]);
            }

            const unpaidSales = await listCustomerReceivableTargets(
              organizationId,
              input.customerId,
              customer,
            );
            const unpaidById = new Map(
              unpaidSales.map((item) => [String(item.id), item]),
            );

            if (
              input.allocationMode === 'invoice_specific' &&
              typeof listUnpaidCustomerSales === 'function'
            ) {
              for (const allocation of input.invoiceAllocations) {
                const unpaid = unpaidById.get(allocation.saleId);
                if (!unpaid) {
                  throw validationFailed('Sale is not an unpaid receivable target', [
                    {
                      field: 'allocations',
                      message: `sale ${allocation.saleId} has no outstanding receivable`,
                    },
                  ]);
                }
                if (
                  BigInt(allocation.allocatedAmountMinorUnits) >
                  BigInt(unpaid.outstandingMinorUnits)
                ) {
                  throw validationFailed('Allocation exceeds outstanding sale receivable', [
                    {
                      field: 'allocations',
                      message: `allocation for ${allocation.saleId} exceeds outstanding`,
                    },
                  ]);
                }
              }
            }

            const plan = await resolveCustomerAllocationPlan(input, unpaidSales);
            const postedAt = now();

            let posted;
            try {
              posted = await postCustomerPaymentInSession(session, {
                organizationId,
                customerId: input.customerId,
                accountId: input.accountId,
                amountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                paymentDate: input.paymentDate,
                allocationMode: input.allocationMode,
                saleAllocations: plan.saleAllocations,
                advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
                notes: input.notes,
                postedAt,
                postedBy: actor.actorId,
                postAccountMovement: true,
              });
            } catch (error) {
              mapDuplicate(error, 'Customer payment effects already exist for this source');
            }

            return toPaymentDto(posted.payment, posted.allocations);
          });

          return { statusCode: 201, body: dto };
        },
      );

      return {
        replay: result.replay,
        data: result.response.body,
        statusCode: result.response.statusCode,
      };
    },
  };
}

module.exports = {
  createPaymentsService,
};
