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
const { parseSupplierPayment, toPaymentDto } = require('./payments.validation');

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function createPaymentsService(deps) {
  const store = deps.store;
  const ledgersService = deps.ledgersService;
  const accountsService = deps.accountsService;
  const suppliersService = deps.suppliersService;
  const listUnpaidSupplierPurchases = deps.listUnpaidSupplierPurchases;
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
      postedAt: input.postedAt,
      postedBy: input.postedBy,
    });
  }

  return {
    allocateGeneralSupplierPayment,
    postSupplierPaymentInSession,
    postSupplierPayableEffect,

    async listSupplierPayments(organizationId, query = {}) {
      const items = await store.listPayments(organizationId, {
        supplierId: query.supplierId,
      });
      const mapped = [];
      for (const item of items) {
        const allocations = await store.listAllocationsByPayment(organizationId, String(item['_id']));
        mapped.push(toPaymentDto(item, allocations));
      }
      return { items: mapped };
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

    async postSupplierPayment(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
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
            if (input.allocationMode === 'general' && typeof listUnpaidSupplierPurchases === 'function') {
              unpaidPurchases = await listUnpaidSupplierPurchases(organizationId, input.supplierId);
            }

            if (input.allocationMode === 'invoice_specific' && typeof listUnpaidSupplierPurchases === 'function') {
              unpaidPurchases = await listUnpaidSupplierPurchases(organizationId, input.supplierId);
              const unpaidById = new Map(unpaidPurchases.map((item) => [String(item.id), item]));
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
