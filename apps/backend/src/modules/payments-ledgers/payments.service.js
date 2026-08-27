const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  conflict,
  notFound,
  validationFailed,
} = require('../../platform/errors/app-error');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { allocateGeneralSupplierPayment } = require('./supplier-allocation');
const { allocateGeneralCustomerPayment } = require('./customer-allocation');
const { parseSupplierPayment, parseCustomerPayment, parsePaymentCorrect, toPaymentDto } = require('./payments.validation');
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
  if (targetType === 'sale') {
    return 'customer_payment_allocation_reversal';
  }
  if (targetType === 'customer_advance') {
    return 'customer_payment_advance_reversal';
  }
  if (targetType === 'purchase') {
    return 'supplier_payment_allocation_reversal';
  }
  return 'supplier_payment_advance_reversal';
}

function originalLedgerSourceType(targetType) {
  if (targetType === 'sale') {
    return 'customer_payment_allocation';
  }
  if (targetType === 'customer_advance') {
    return 'customer_payment_advance';
  }
  if (targetType === 'purchase') {
    return 'supplier_payment_allocation';
  }
  return 'supplier_payment_advance';
}

function originalLedgerSourceId(allocation, paymentId) {
  if (allocation.targetType === 'customer_advance' || allocation.targetType === 'supplier_advance') {
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
    await deps.capabilityService.assertAllowed(
      organizationId,
      'payments.supplier',
      'enabled',
    );
    await deps.capabilityService.assertAllowed(
      organizationId,
      `payments.supplier.actions.${action}`,
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

  async function resolveCustomerAllocationPlan(input, unpaidSales) {
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
        saleAllocations: input.invoiceAllocations,
        advanceAmountMinorUnits: (paymentAmount - totalAllocated).toString(),
      };
    }

    const plan = allocateGeneralCustomerPayment(unpaidSales ?? [], input.amountMinorUnits);
    return {
      saleAllocations: plan.allocations.map((item) => ({
        saleId: item.saleId,
        allocatedAmountMinorUnits: item.allocatedAmountMinorUnits,
      })),
      advanceAmountMinorUnits: plan.advanceAmountMinorUnits,
    };
  }

  async function resolveAllocationPlan(input, unpaidPurchases) {
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
        purchaseAllocations: input.invoiceAllocations,
        advanceAmountMinorUnits: (paymentAmount - totalAllocated).toString(),
      };
    }

    const plan = allocateGeneralSupplierPayment(unpaidPurchases ?? [], input.amountMinorUnits);
    return {
      purchaseAllocations: plan.allocations.map((item) => ({
        purchaseId: item.purchaseId,
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
      const allocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType: 'purchase',
        targetId: item.purchaseId,
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
      const allocation = await store.insertAllocation(session, {
        organizationId: input.organizationId,
        paymentId,
        targetType: 'sale',
        targetId: item.saleId,
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

  return {
    allocateGeneralSupplierPayment,
    allocateGeneralCustomerPayment,
    postSupplierPaymentInSession,
    postSupplierPayableEffect,
    postCustomerPaymentInSession,
    postCustomerReceivableEffect,

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

    async sumSupplierPayable(organizationId, supplierId) {
      return ledgersService.sumSupplierPayable(organizationId, supplierId);
    },

    async listCustomerReceivableBalances(organizationId) {
      return ledgersService.listCustomerReceivableBalances(organizationId);
    },

    async listSupplierPayableBalances(organizationId) {
      return ledgersService.listSupplierPayableBalances(organizationId);
    },

    async listUnpaidPurchasesForSupplier(organizationId, supplierId) {
      if (typeof listUnpaidSupplierPurchases !== 'function') {
        return { items: [] };
      }
      const items = await listUnpaidSupplierPurchases(organizationId, supplierId);
      return {
        items: items.map((item) => ({
          id: String(item.id),
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

    async listSupplierPayments(organizationId, query = {}) {
      const { items, total } = await store.listPaymentsPage(organizationId, {
        partyType: 'supplier',
        supplierId: query.supplierId,
        search: query.search,
      }, { skip: query.skip, pageSize: query.pageSize });
      const mapped = [];
      for (const item of items) {
        const allocations = await store.listAllocationsByPayment(organizationId, String(item['_id']));
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

            if (input.allocationMode === 'general' && typeof listUnpaidSupplierPurchases === 'function') {
              unpaidPurchases = await listUnpaidSupplierPurchases(organizationId, input.supplierId);
              unpaidById = new Map(unpaidPurchases.map((item) => [String(item.id), item]));
            }

            if (input.allocationMode === 'invoice_specific' && typeof listUnpaidSupplierPurchases === 'function') {
              unpaidPurchases = await listUnpaidSupplierPurchases(organizationId, input.supplierId);
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
                if (BigInt(allocation.allocatedAmountMinorUnits) > BigInt(unpaid.outstandingMinorUnits)) {
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
            if (input.allocationMode === 'invoice_specific' && typeof listUnpaidSupplierPurchases === 'function') {
              for (const item of input.invoiceAllocations) {
                const existing = await store.listAllocationsByTarget(
                  organizationId,
                  'purchase',
                  item.purchaseId,
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
            if (input.allocationMode === 'invoice_specific' && typeof listUnpaidSupplierPurchases === 'function') {
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
                : original.partyType === 'customer' && allocation.targetType === 'sale'
                  ? String(allocation.allocatedAmountMinorUnits)
                  : original.partyType === 'customer'
                    ? negateMinorUnits(allocation.allocatedAmountMinorUnits)
                    : allocation.targetType === 'purchase'
                      ? String(allocation.allocatedAmountMinorUnits)
                      : negateMinorUnits(allocation.allocatedAmountMinorUnits);

              await ledgersService.postLedgerEffect(session, {
                organizationId,
                partyType: original.partyType,
                customerId: original.customerId,
                supplierId: original.supplierId,
                effectKind: originalEffect?.effectKind
                  ?? (allocation.targetType === 'sale' || allocation.targetType === 'purchase'
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

            if (accountsService && typeof accountsService.listAccountMovementsBySource === 'function') {
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
                const unpaidSales =
                  typeof listUnpaidCustomerSales === 'function'
                    ? await listUnpaidCustomerSales(organizationId, replacementInput.customerId)
                    : [];
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
                const unpaidPurchases =
                  typeof listUnpaidSupplierPurchases === 'function'
                    ? await listUnpaidSupplierPurchases(organizationId, replacementInput.supplierId)
                    : [];
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
      const { items, total } = await store.listPaymentsPage(organizationId, {
        partyType: 'customer',
        customerId: query.customerId,
        search: query.search,
      }, { skip: query.skip, pageSize: query.pageSize });
      const mapped = [];
      for (const item of items) {
        const allocations = await store.listAllocationsByPayment(organizationId, String(item['_id']));
        mapped.push(toPaymentDto(item, allocations));
      }
      return { items: mapped, total };
    },

    async getCustomerPayment(organizationId, paymentId) {
      const payment = await store.findPaymentById(organizationId, paymentId);
      if (payment === null || payment.partyType !== 'customer') {
        throw notFound('Customer payment not found');
      }
      const allocations = await store.listAllocationsByPayment(organizationId, paymentId);
      return toPaymentDto(payment, allocations);
    },

    async listCustomerLedger(organizationId, customerId) {
      if (customersService) {
        await customersService.getCustomer(organizationId, customerId);
      }
      return ledgersService.listCustomerEffects(organizationId, customerId);
    },

    async listUnpaidSalesForCustomer(organizationId, customerId) {
      if (typeof listUnpaidCustomerSales !== 'function') {
        return { items: [] };
      }
      const items = await listUnpaidCustomerSales(organizationId, customerId);
      return {
        items: items.map((item) => ({
          id: String(item.id),
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

            let unpaidSales = [];
            let unpaidById = new Map();

            if (typeof listUnpaidCustomerSales === 'function') {
              unpaidSales = await listUnpaidCustomerSales(organizationId, input.customerId);
              unpaidById = new Map(unpaidSales.map((item) => [String(item.id), item]));
            }

            if (input.allocationMode === 'invoice_specific' && typeof listUnpaidCustomerSales === 'function') {
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
                if (BigInt(allocation.allocatedAmountMinorUnits) > BigInt(unpaid.outstandingMinorUnits)) {
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
