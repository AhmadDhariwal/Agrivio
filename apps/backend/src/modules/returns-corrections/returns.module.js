const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const {
  conflict,
  forbidden,
  notFound,
  validationFailed,
} = require('../../platform/errors/app-error');
const { hasPermission } = require('../identity/role-permissions');
const {
  QUANTITY_MINOR_UNIT_FACTOR,
  convertEnteredQuantityToBaseMinorUnits,
  multiplyMoneyMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const {
  parsePurchaseReturnDraft,
  parseSalesReturnDraft,
  parseWithoutInvoiceDraft,
  parseReturnPost,
  parseReturnReverse,
  toReturnDto,
  SUPPORTED_REFUND_ACCOUNT_TYPES,
} = require('./returns.validation');
const { createInMemoryReturnsStore, createMongooseReturnsStore } = require('./returns.store');

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function proportionalMinor(totalMinor, partQty, totalQty) {
  const total = BigInt(String(totalMinor ?? '0'));
  const part = BigInt(String(partQty ?? '0'));
  const whole = BigInt(String(totalQty ?? '0'));
  if (whole <= 0n || part <= 0n) {
    return 0n;
  }
  return (total * part) / whole;
}

function createReturnsService(deps) {
  const store = deps.store;
  const inventoryService = deps.inventoryService;
  const paymentsService = deps.paymentsService;
  const accountsService = deps.accountsService;
  const catalogService = deps.catalogService;
  const customersService = deps.customersService;
  const locationsService = deps.locationsService;
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

  async function assertWarehouseAccess(authContext, warehouseId) {
    if (typeof deps.canAccessWarehouse === 'function') {
      if (!deps.canAccessWarehouse(authContext, String(warehouseId))) {
        throw forbidden('Warehouse assignment is required');
      }
    }
  }

  async function resolvePurchaseSource(organizationId, purchaseId) {
    if (!deps.purchasesService) {
      throw validationFailed('purchasesService dependency is not configured');
    }
    if (typeof deps.purchasesService.getPurchaseSourceForReturn !== 'function') {
      throw validationFailed(
        'purchasesService.getPurchaseSourceForReturn is not implemented — wire the purchases module public method',
      );
    }
    return deps.purchasesService.getPurchaseSourceForReturn(organizationId, purchaseId);
  }

  async function resolveSaleSource(organizationId, saleId) {
    if (!deps.salesService) {
      throw validationFailed('salesService dependency is not configured');
    }
    if (typeof deps.salesService.getSaleSourceForReturn !== 'function') {
      throw validationFailed(
        'salesService.getSaleSourceForReturn is not implemented — wire the sales module public method',
      );
    }
    return deps.salesService.getSaleSourceForReturn(organizationId, saleId);
  }

  function mergeLineClassification(existingLine, overrides, index) {
    const override =
      (overrides ?? []).find(
        (item) => Number(item.originalLineIndex) === Number(existingLine.originalLineIndex ?? index),
      ) ?? (overrides ?? [])[index];
    const stockCondition = override?.stockCondition ?? existingLine.stockCondition ?? null;
    const unsellableReason = override?.unsellableReason ?? existingLine.unsellableReason ?? null;
    const documentedUnitCostMinorUnits =
      override?.documentedUnitCostMinorUnits ?? existingLine.documentedUnitCostMinorUnits ?? null;
    return { stockCondition, unsellableReason, documentedUnitCostMinorUnits };
  }

  function requireExplicitStockCondition(classification, fieldPrefix) {
    if (classification.stockCondition !== 'sellable' && classification.stockCondition !== 'unsellable') {
      throw validationFailed('Returned stock must be classified as sellable or unsellable', [
        { field: `${fieldPrefix}.stockCondition`, message: 'stockCondition is required' },
      ]);
    }
    if (classification.stockCondition === 'unsellable' && !classification.unsellableReason) {
      throw validationFailed('Unsellable returns require an unsellable reason', [
        {
          field: `${fieldPrefix}.unsellableReason`,
          message: 'unsellableReason is required for unsellable stock',
        },
      ]);
    }
    return classification;
  }

  async function assertRefundAccount(organizationId, accountId) {
    if (!accountsService) {
      throw validationFailed('accountsService is required for account_refund resolution');
    }
    const account = await accountsService.getAccount(organizationId, accountId);
    if (account.status !== 'active') {
      throw validationFailed('Refund account must be active', [
        { field: 'refundAccountId', message: 'account must be active' },
      ]);
    }
    if (!SUPPORTED_REFUND_ACCOUNT_TYPES.includes(String(account.accountType))) {
      throw validationFailed('Refund account must be cash, bank, JazzCash, or Easypaisa', [
        { field: 'refundAccountId', message: 'unsupported refund account type' },
      ]);
    }
    return account;
  }

  async function postFinancialResolution(session, organizationId, actor, postedAt, input) {
    const {
      returnId,
      customerId,
      resolution,
      refundAccountId,
      returnTotal,
    } = input;

    if (resolution === 'account_refund') {
      await assertRefundAccount(organizationId, refundAccountId);
      await accountsService.postAccountMovement(session, {
        organizationId,
        accountId: refundAccountId,
        signedAmountMinorUnits: (-returnTotal).toString(),
        sourceType: 'sales_return_refund',
        sourceId: returnId,
        postedAt,
        postedBy: actor.actorId,
      });
      return;
    }

    if (!customerId) {
      throw validationFailed('Ledger adjustment requires a customer', [
        { field: 'resolution', message: 'ledger_adjustment requires a customer ledger' },
      ]);
    }

    if (returnTotal !== 0n) {
      await paymentsService.postCustomerReceivableEffect(session, {
        organizationId,
        customerId,
        signedAmountMinorUnits: (-returnTotal).toString(),
        sourceType: 'sales_return',
        sourceId: returnId,
        postedAt,
        postedBy: actor.actorId,
      });
    }
  }

  async function postPurchaseReturnInSession(
    session,
    organizationId,
    actor,
    returnId,
    existing,
    input,
    authContext,
  ) {
    if (!hasPermission(authContext?.permissions ?? [], 'purchases.return')) {
      throw forbidden('Missing permission purchases.return');
    }
    if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
      throw forbidden('Missing permission returns.post');
    }

    const purchase = await resolvePurchaseSource(organizationId, String(existing.purchaseId));
    if (!purchase || purchase.status !== 'posted') {
      throw validationFailed('Source purchase must still be posted', [
        { field: 'purchaseId', message: 'purchase must be posted' },
      ]);
    }

    const postedAt = now();
    const postedLines = [];
    let returnTotal = 0n;

    for (let index = 0; index < existing.lines.length; index += 1) {
      const line = existing.lines[index];
      const origIdx = Number(line.originalLineIndex);
      const purchaseLine = purchase.lines[origIdx];

      if (purchaseLine === undefined) {
        throw validationFailed(
          `Return line ${index} references a purchase line that no longer exists`,
          [{ field: `lines[${index}]`, message: 'original purchase line not found' }],
        );
      }

      const originalQtyBase = BigInt(String(purchaseLine.quantityBaseMinorUnits));
      const alreadyReturnedStr = await store.sumPostedReturnedQuantityByPurchaseLine(
        organizationId,
        String(existing.purchaseId),
        origIdx,
      );
      const alreadyReturned = BigInt(alreadyReturnedStr);
      const returnableQty = originalQtyBase - alreadyReturned;
      const requestedQty = BigInt(String(line.quantityBaseMinorUnits));

      if (requestedQty > returnableQty) {
        throw validationFailed(`lines[${index}]: return quantity exceeds returnable quantity`, [
          {
            field: `lines[${index}].quantity`,
            message: 'return quantity exceeds what is returnable for this purchase line',
          },
        ]);
      }

      const expectedBatchId = purchaseLine.batchId ? String(purchaseLine.batchId) : null;
      const lineBatchId = line.batchId ? String(line.batchId) : null;
      if (expectedBatchId !== lineBatchId) {
        throw validationFailed(
          `lines[${index}]: batch identity must match the original purchase receipt`,
          [
            {
              field: `lines[${index}].batchId`,
              message: 'batch identity must match the original purchase batch',
            },
          ],
        );
      }

      const originalReceiptValue = BigInt(
        String(purchaseLine.receiptInventoryValueMinorUnits ?? '0'),
      );
      const proportionalValue = proportionalMinor(
        originalReceiptValue,
        requestedQty,
        originalQtyBase,
      );
      const receiptUnitCost = requestedQty > 0n ? proportionalValue / requestedQty : 0n;

      await inventoryService.postOutboundIssueInSession(session, organizationId, actor, {
        warehouseId: String(existing.warehouseId),
        productId: String(line.productId),
        batchId: line.batchId ? String(line.batchId) : null,
        quantityBaseMinorUnits: String(requestedQty),
        enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
        unitCode: String(line.unitCodeSnapshot),
        conversionFactorSnapshot: String(line.conversionFactorSnapshot),
        packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
        inventoryValueMinorUnits: proportionalValue.toString(),
        useExplicitOutboundValue: true,
        sourceType: 'purchase_return',
        sourceId: returnId,
        postedAt,
      });

      returnTotal += proportionalValue;
      postedLines.push({
        ...line,
        returnInventoryValueMinorUnits: proportionalValue.toString(),
        receiptUnitCostMinorUnits: receiptUnitCost.toString(),
      });
    }

    await paymentsService.postSupplierPayableEffect(session, {
      organizationId,
      supplierId: String(existing.supplierId),
      signedAmountMinorUnits: (-returnTotal).toString(),
      sourceType: 'purchase_return',
      sourceId: returnId,
      postedAt,
      postedBy: actor.actorId,
    });

    if (input.resolution === 'account_refund' && input.refundAccountId) {
      await assertRefundAccount(organizationId, input.refundAccountId);
      await accountsService.postAccountMovement(session, {
        organizationId,
        accountId: input.refundAccountId,
        signedAmountMinorUnits: returnTotal.toString(),
        sourceType: 'purchase_return_refund',
        sourceId: returnId,
        postedAt,
        postedBy: actor.actorId,
      });
    }

    return { postedAt, postedLines, returnTotal, extraPatch: {} };
  }

  async function restoreSaleLineStock(
    session,
    organizationId,
    actor,
    returnId,
    existing,
    saleLine,
    line,
    requestedQty,
    classification,
    postedAt,
    index,
  ) {
    const allocations = saleLine.stockAllocations ?? [];
    const requestedBatchId = line.batchId ? String(line.batchId) : null;
    const identifiableBatches = allocations.filter((item) => item.batchId);

    if (requestedBatchId) {
      const match = allocations.find(
        (item) => item.batchId && String(item.batchId) === requestedBatchId,
      );
      if (!match) {
        throw validationFailed(
          `lines[${index}]: batch must match an original sale allocation`,
          [
            {
              field: `lines[${index}].batchId`,
              message: 'do not restore to an unrelated batch',
            },
          ],
        );
      }
    } else if (identifiableBatches.length > 1) {
      throw validationFailed(
        `lines[${index}]: original batch must be specified when multiple batches were sold`,
        [
          {
            field: `lines[${index}].batchId`,
            message: 'restore the exact source batch where identifiable',
          },
        ],
      );
    }

    const slices = [];
    if (requestedBatchId) {
      const alreadyReturned = BigInt(
        await store.sumPostedReturnedQuantityBySaleLine(
          organizationId,
          String(existing.saleId),
          Number(line.originalLineIndex),
          requestedBatchId,
          session,
        ),
      );
      const allocation = allocations.find(
        (item) => item.batchId && String(item.batchId) === requestedBatchId,
      );
      const returnable = BigInt(String(allocation.quantityBaseMinorUnits)) - alreadyReturned;
      if (requestedQty > returnable) {
        throw validationFailed(
          `lines[${index}]: return quantity exceeds remaining returnable quantity for this batch`,
          [{ field: `lines[${index}].quantity`, message: 'exceeds remaining returnable quantity' }],
        );
      }
      slices.push({
        batchId: requestedBatchId,
        batchNumber: allocation.batchNumber ?? null,
        expiryDate: allocation.expiryDate ?? null,
        quantityBaseMinorUnits: requestedQty,
        enteredQuantityMinorUnits: BigInt(String(line.enteredQuantityMinorUnits)),
        inventoryValueMinorUnits: proportionalMinor(
          allocation.cogsMinorUnits,
          requestedQty,
          allocation.quantityBaseMinorUnits,
        ),
      });
    } else if (allocations.length === 0) {
      slices.push({
        batchId: null,
        batchNumber: null,
        expiryDate: null,
        quantityBaseMinorUnits: requestedQty,
        enteredQuantityMinorUnits: BigInt(String(line.enteredQuantityMinorUnits)),
        inventoryValueMinorUnits: proportionalMinor(
          saleLine.cogsTotalMinorUnits,
          requestedQty,
          saleLine.quantityBaseMinorUnits,
        ),
      });
    } else {
      const allocation = allocations[0];
      const alreadyReturned = BigInt(
        await store.sumPostedReturnedQuantityBySaleLine(
          organizationId,
          String(existing.saleId),
          Number(line.originalLineIndex),
          allocation.batchId ? String(allocation.batchId) : null,
          session,
        ),
      );
      const returnable = BigInt(String(allocation.quantityBaseMinorUnits)) - alreadyReturned;
      if (requestedQty > returnable) {
        throw validationFailed(
          `lines[${index}]: return quantity exceeds remaining returnable quantity`,
          [{ field: `lines[${index}].quantity`, message: 'exceeds remaining returnable quantity' }],
        );
      }
      slices.push({
        batchId: allocation.batchId ? String(allocation.batchId) : null,
        batchNumber: allocation.batchNumber ?? null,
        expiryDate: allocation.expiryDate ?? null,
        quantityBaseMinorUnits: requestedQty,
        enteredQuantityMinorUnits: BigInt(String(line.enteredQuantityMinorUnits)),
        inventoryValueMinorUnits: proportionalMinor(
          allocation.cogsMinorUnits,
          requestedQty,
          allocation.quantityBaseMinorUnits,
        ),
      });
    }

    let restoredValue = 0n;
    for (const slice of slices) {
      await inventoryService.postInboundReceiptInSession(session, organizationId, actor, {
        warehouseId: String(existing.warehouseId),
        productId: String(line.productId),
        batchId: slice.batchId,
        batchNumber: slice.batchNumber,
        expiryDate: slice.expiryDate,
        quantityBaseMinorUnits: slice.quantityBaseMinorUnits.toString(),
        enteredQuantityMinorUnits: slice.enteredQuantityMinorUnits.toString(),
        unitCode: String(line.unitCodeSnapshot),
        conversionFactorSnapshot: String(line.conversionFactorSnapshot),
        packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
        inventoryValueMinorUnits: slice.inventoryValueMinorUnits.toString(),
        sourceType: 'sales_return',
        sourceId: returnId,
        stockCondition: classification.stockCondition,
        reason: classification.unsellableReason,
        postedAt,
      });
      restoredValue += slice.inventoryValueMinorUnits;
    }
    return restoredValue;
  }

  async function postSalesLinkedReturnInSession(
    session,
    organizationId,
    actor,
    returnId,
    existing,
    input,
    authContext,
  ) {
    if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
      throw forbidden('Missing permission returns.post');
    }

    const sale = await resolveSaleSource(organizationId, String(existing.saleId));
    const postedAt = now();
    const postedLines = [];
    let returnTotal = 0n;

    for (let index = 0; index < existing.lines.length; index += 1) {
      const line = existing.lines[index];
      const origIdx = Number(line.originalLineIndex);
      const saleLine = sale.lines[origIdx];
      if (saleLine === undefined) {
        throw validationFailed(
          `Return line ${index} references a sale line that no longer exists`,
          [{ field: `lines[${index}]`, message: 'original sale line not found' }],
        );
      }

      const classification = requireExplicitStockCondition(
        mergeLineClassification(line, input.lineOverrides, index),
        `lines[${index}]`,
      );

      const originalQtyBase = BigInt(String(saleLine.quantityBaseMinorUnits));
      const alreadyReturned = BigInt(
        await store.sumPostedReturnedQuantityBySaleLine(
          organizationId,
          String(existing.saleId),
          origIdx,
          undefined,
          session,
        ),
      );
      const returnableQty = originalQtyBase - alreadyReturned;
      const requestedQty = BigInt(String(line.quantityBaseMinorUnits));
      if (requestedQty > returnableQty) {
        throw validationFailed(
          `lines[${index}]: return quantity exceeds remaining returnable quantity`,
          [
            {
              field: `lines[${index}].quantity`,
              message: 'cumulative returns cannot exceed original sold quantity',
            },
          ],
        );
      }

      const restoredValue = await restoreSaleLineStock(
        session,
        organizationId,
        actor,
        returnId,
        existing,
        saleLine,
        { ...line, ...classification },
        requestedQty,
        classification,
        postedAt,
        index,
      );

      const revenue = proportionalMinor(
        saleLine.lineProductAmountMinorUnits,
        requestedQty,
        originalQtyBase,
      );
      returnTotal += revenue;
      postedLines.push({
        ...line,
        stockCondition: classification.stockCondition,
        unsellableReason: classification.unsellableReason,
        returnInventoryValueMinorUnits: restoredValue.toString(),
        receiptUnitCostMinorUnits:
          requestedQty > 0n ? (restoredValue / requestedQty).toString() : '0',
        returnRevenueMinorUnits: revenue.toString(),
      });
    }

    await postFinancialResolution(session, organizationId, actor, postedAt, {
      returnId,
      customerId: existing.customerId ? String(existing.customerId) : sale.customerId,
      resolution: input.resolution,
      refundAccountId: input.refundAccountId,
      returnTotal,
    });

    return { postedAt, postedLines, returnTotal, extraPatch: {} };
  }

  async function postWithoutInvoiceReturnInSession(
    session,
    organizationId,
    actor,
    returnId,
    existing,
    input,
    authContext,
  ) {
    if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
      throw forbidden('Missing permission returns.post');
    }
    if (!hasPermission(authContext?.permissions ?? [], 'returns.without-invoice.approve')) {
      throw forbidden('Missing permission returns.without-invoice.approve');
    }
    if (!input.approvedReturnValueMinorUnits) {
      throw validationFailed('Manually approved refund value is required', [
        { field: 'approvedReturnValue', message: 'approvedReturnValue is required' },
      ]);
    }

    const postedAt = now();
    const postedLines = [];

    for (let index = 0; index < existing.lines.length; index += 1) {
      const line = existing.lines[index];
      const classification = requireExplicitStockCondition(
        mergeLineClassification(line, input.lineOverrides, index),
        `lines[${index}]`,
      );
      const requestedQty = BigInt(String(line.quantityBaseMinorUnits));
      const costState = await inventoryService.getWarehouseProductCostState(
        organizationId,
        String(existing.warehouseId),
        String(line.productId),
      );
      const documented = classification.documentedUnitCostMinorUnits
        ? BigInt(String(classification.documentedUnitCostMinorUnits))
        : null;
      const unitCost = documented ?? BigInt(String(costState.weightedAverageCostMinorUnits ?? '0'));
      const inventoryValue = multiplyMoneyMinorUnits(
        unitCost,
        requestedQty,
        QUANTITY_MINOR_UNIT_FACTOR,
      );

      await inventoryService.postInboundReceiptInSession(session, organizationId, actor, {
        warehouseId: String(existing.warehouseId),
        productId: String(line.productId),
        batchId: line.batchId ? String(line.batchId) : null,
        batchNumber: line.batchNumber ?? null,
        expiryDate: line.expiryDate ?? null,
        quantityBaseMinorUnits: requestedQty.toString(),
        enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
        unitCode: String(line.unitCodeSnapshot),
        conversionFactorSnapshot: String(line.conversionFactorSnapshot),
        packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
        inventoryValueMinorUnits: inventoryValue.toString(),
        sourceType: 'sales_return',
        sourceId: returnId,
        stockCondition: classification.stockCondition,
        reason: classification.unsellableReason,
        postedAt,
      });

      postedLines.push({
        ...line,
        stockCondition: classification.stockCondition,
        unsellableReason: classification.unsellableReason,
        documentedUnitCostMinorUnits: documented ? documented.toString() : null,
        returnInventoryValueMinorUnits: inventoryValue.toString(),
        receiptUnitCostMinorUnits: unitCost.toString(),
        returnRevenueMinorUnits: null,
      });
    }

    const returnTotal = BigInt(String(input.approvedReturnValueMinorUnits));
    await postFinancialResolution(session, organizationId, actor, postedAt, {
      returnId,
      customerId: existing.customerId ? String(existing.customerId) : null,
      resolution: input.resolution,
      refundAccountId: input.refundAccountId,
      returnTotal,
    });

    return {
      postedAt,
      postedLines,
      returnTotal,
      extraPatch: {
        approvedReturnValueMinorUnits: returnTotal.toString(),
        withoutInvoiceApproval: {
          approvedBy: actor.actorId,
          approvedAt: postedAt,
          reason: input.reason,
        },
      },
    };
  }

  function reversalSourceTypes(returnType) {
    if (returnType === 'purchase') {
      return {
        stockOriginal: 'purchase_return',
        stockReversal: 'purchase_return_reversal',
        ledgerOriginal: 'purchase_return',
        ledgerReversal: 'purchase_return_reversal',
        accountOriginal: 'purchase_return_refund',
        accountReversal: 'purchase_return_refund_reversal',
      };
    }
    return {
      stockOriginal: 'sales_return',
      stockReversal: 'sales_return_reversal',
      ledgerOriginal: 'sales_return',
      ledgerReversal: 'sales_return_reversal',
      accountOriginal: 'sales_return_refund',
      accountReversal: 'sales_return_refund_reversal',
    };
  }

  async function reverseLinkedEffects(session, organizationId, actor, existing, correctiveId, reason, postedAt) {
    const types = reversalSourceTypes(String(existing.returnType));
    const sourceReturnId = String(existing['_id']);

    if (!inventoryService || typeof inventoryService.listMovementsBySource !== 'function') {
      throw validationFailed('inventoryService.listMovementsBySource is required for return reversal');
    }
    if (!paymentsService || typeof paymentsService.listLedgerEffectsBySource !== 'function') {
      throw validationFailed('paymentsService.listLedgerEffectsBySource is required for return reversal');
    }
    if (!accountsService || typeof accountsService.listAccountMovementsBySource !== 'function') {
      throw validationFailed('accountsService.listAccountMovementsBySource is required for return reversal');
    }

    const originalMovements = await inventoryService.listMovementsBySource(
      organizationId,
      types.stockOriginal,
      sourceReturnId,
      session,
    );
    if (originalMovements.length === 0) {
      throw validationFailed('Source return stock movements were not found for reversal', [
        { field: 'id', message: 'source stock movements are required' },
      ]);
    }

    for (const movement of originalMovements) {
      const reverseDirection = movement.direction === 'inbound' ? 'outbound' : 'inbound';
      const common = {
        warehouseId: String(existing.warehouseId),
        productId: String(movement.productId),
        batchId: movement.batchId,
        quantityBaseMinorUnits: String(movement.quantityBaseMinorUnits),
        enteredQuantityMinorUnits: String(movement.enteredQuantityMinorUnits),
        unitCode: String(movement.unitCode),
        conversionFactorSnapshot: String(movement.conversionFactorSnapshot),
        packagingUnitId: movement.packagingUnitId,
        inventoryValueMinorUnits: String(movement.inventoryValueMinorUnits),
        sourceType: types.stockReversal,
        sourceId: correctiveId,
        stockCondition: movement.stockCondition,
        reversalOfId: movement.id,
        reason,
        postedAt,
      };
      if (reverseDirection === 'inbound') {
        await inventoryService.postInboundReceiptInSession(session, organizationId, actor, common);
      } else {
        await inventoryService.postOutboundIssueInSession(session, organizationId, actor, {
          ...common,
          useExplicitOutboundValue: movement.stockCondition !== 'unsellable',
          allowNegativeStockOverride: false,
        });
      }
    }

    const originalLedger = await paymentsService.listLedgerEffectsBySource(
      organizationId,
      types.ledgerOriginal,
      sourceReturnId,
      session,
    );
    for (const effect of originalLedger) {
      const opposite = (-BigInt(String(effect.signedAmountMinorUnits))).toString();
      if (effect.partyType === 'supplier') {
        await paymentsService.postSupplierPayableEffect(session, {
          organizationId,
          supplierId: effect.supplierId,
          signedAmountMinorUnits: opposite,
          sourceType: types.ledgerReversal,
          sourceId: correctiveId,
          reversalOfId: effect.id,
          postedAt,
          postedBy: actor.actorId,
        });
      } else if (effect.partyType === 'customer') {
        await paymentsService.postCustomerReceivableEffect(session, {
          organizationId,
          customerId: effect.customerId,
          signedAmountMinorUnits: opposite,
          sourceType: types.ledgerReversal,
          sourceId: correctiveId,
          reversalOfId: effect.id,
          postedAt,
          postedBy: actor.actorId,
        });
      }
    }

    if (existing.resolution === 'account_refund' && existing.refundAccountId) {
      const originalAccounts = await accountsService.listAccountMovementsBySource(
        organizationId,
        types.accountOriginal,
        sourceReturnId,
        session,
      );
      for (const movement of originalAccounts) {
        await accountsService.postAccountMovement(session, {
          organizationId,
          accountId: movement.accountId,
          signedAmountMinorUnits: (-BigInt(String(movement.signedAmountMinorUnits))).toString(),
          sourceType: types.accountReversal,
          sourceId: correctiveId,
          reversalOfId: movement.id,
          postedAt,
          postedBy: actor.actorId,
        });
      }
    }
  }

  return {
    async listReturns(organizationId, query = {}, authContext) {
      const assignments = Array.isArray(authContext?.warehouseAssignments) ? authContext.warehouseAssignments : null;
      const warehouseIds = authContext?.role === 'Owner' || assignments === null ? undefined : assignments.filter((item) => String(item.organizationId) === String(organizationId)).map((item) => String(item.targetId));
      const filters = {
        status: query.status,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
        purchaseId: query.purchaseId,
        saleId: query.saleId,
        customerId: query.customerId,
        returnType: query.returnType,
        warehouseIds: query.warehouseId ? undefined : warehouseIds,
      };
      let result;
      if (typeof store.listReturnsPage === 'function') result = await store.listReturnsPage(organizationId, filters, query);
      else {
        let all = await store.listReturns(organizationId, filters);
        if (warehouseIds) all = all.filter((item) => warehouseIds.includes(String(item.warehouseId)));
        const hasPagination = query.skip !== undefined || query.pageSize !== undefined;
        result = {
          items: hasPagination
            ? all.slice(query.skip ?? 0, (query.skip ?? 0) + (query.pageSize ?? 25))
            : all,
          total: all.length,
        };
      }
      const items = result.items;
      const filtered = [];
      for (const item of items) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(item.warehouseId))
        ) {
          continue;
        }
        filtered.push(toReturnDto(item));
      }
      return { items: filtered, total: result.total };
    },

    async getReturn(organizationId, returnId, authContext) {
      const record = await store.findReturnById(organizationId, returnId);
      if (record === null) {
        throw notFound('Return not found');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(record.warehouseId))
      ) {
        throw notFound('Return not found');
      }
      return toReturnDto(record);
    },

    async createPurchaseReturnDraft(organizationId, purchaseId, body, authContext) {
      if (!hasPermission(authContext?.permissions ?? [], 'purchases.return')) {
        throw forbidden('Missing permission purchases.return');
      }
      if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
        throw forbidden('Missing permission returns.post');
      }

      const input = parsePurchaseReturnDraft({ ...body, purchaseId });
      const purchase = await resolvePurchaseSource(organizationId, input.purchaseId);

      if (!purchase || purchase.status !== 'posted') {
        throw validationFailed('Purchase must be posted to create a return', [
          { field: 'purchaseId', message: 'purchase must be posted' },
        ]);
      }

      await assertWarehouseAccess(authContext, purchase.warehouseId);

      const resolvedLines = [];
      for (let index = 0; index < input.lines.length; index += 1) {
        const lineInput = input.lines[index];
        const originalLine = purchase.lines[lineInput.originalLineIndex];
        if (originalLine === undefined) {
          throw validationFailed(
            `lines[${index}].originalLineIndex ${lineInput.originalLineIndex} does not exist on purchase`,
            [{ field: `lines[${index}].originalLineIndex`, message: 'line index out of range' }],
          );
        }

        let enteredQuantityMinorUnits;
        try {
          enteredQuantityMinorUnits = parseQuantityMinorUnits(lineInput.quantity);
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity is invalid`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }
        if (enteredQuantityMinorUnits <= 0n) {
          throw validationFailed(`lines[${index}].quantity must be greater than zero`, [
            { field: `lines[${index}].quantity`, message: 'quantity must be greater than zero' },
          ]);
        }

        let quantityBaseMinorUnits;
        try {
          quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
            enteredQuantityMinorUnits,
            String(originalLine.conversionFactorSnapshot),
          );
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity conversion failed`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }

        resolvedLines.push({
          productId: String(originalLine.productId),
          productNameSnapshot: String(originalLine.productNameSnapshot),
          packagingUnitId: originalLine.packagingUnitId
            ? String(originalLine.packagingUnitId)
            : null,
          unitCodeSnapshot: String(originalLine.unitCodeSnapshot),
          conversionFactorSnapshot: String(originalLine.conversionFactorSnapshot),
          enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          batchId: originalLine.batchId ? String(originalLine.batchId) : null,
          batchNumber: originalLine.batchNumber ?? null,
          manufacturingDate: originalLine.manufacturingDate ?? null,
          expiryDate: originalLine.expiryDate ?? null,
          originalLineIndex: lineInput.originalLineIndex,
          returnInventoryValueMinorUnits: null,
          receiptUnitCostMinorUnits: null,
        });
      }

      return transactionRunner.run(async (session) => {
        const created = await store.insertReturn(session, {
          organizationId,
          returnType: 'purchase',
          purchaseId: input.purchaseId,
          supplierId: String(purchase.supplierId),
          warehouseId: String(purchase.warehouseId),
          reason: '',
          resolution: 'ledger_adjustment',
          refundAccountId: null,
          status: 'draft',
          lines: resolvedLines,
          returnTotalMinorUnits: null,
          currency: purchase.currency ?? 'PKR',
          postedAt: null,
          postedBy: null,
          createdBy: authContext.userId,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'return.draft.created',
          resourceType: 'return',
          resourceId: String(created['_id']),
          metadata: {
            returnType: 'purchase',
            purchaseId: input.purchaseId,
            lineCount: resolvedLines.length,
          },
        });

        return toReturnDto(created);
      });
    },

    async createSalesReturnDraft(organizationId, saleId, body, authContext) {
      if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
        throw forbidden('Missing permission returns.post');
      }

      const input = parseSalesReturnDraft({ ...body, saleId });
      const sale = await resolveSaleSource(organizationId, input.saleId);
      await assertWarehouseAccess(authContext, sale.warehouseId);

      const resolvedLines = [];
      for (let index = 0; index < input.lines.length; index += 1) {
        const lineInput = input.lines[index];
        const originalLine = sale.lines[lineInput.originalLineIndex];
        if (originalLine === undefined) {
          throw validationFailed(
            `lines[${index}].originalLineIndex ${lineInput.originalLineIndex} does not exist on sale`,
            [{ field: `lines[${index}].originalLineIndex`, message: 'line index out of range' }],
          );
        }

        let enteredQuantityMinorUnits;
        try {
          enteredQuantityMinorUnits = parseQuantityMinorUnits(lineInput.quantity);
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity is invalid`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }
        if (enteredQuantityMinorUnits <= 0n) {
          throw validationFailed(`lines[${index}].quantity must be greater than zero`, [
            { field: `lines[${index}].quantity`, message: 'quantity must be greater than zero' },
          ]);
        }

        let quantityBaseMinorUnits;
        try {
          quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
            enteredQuantityMinorUnits,
            String(originalLine.conversionFactorSnapshot),
          );
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity conversion failed`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }

        if (lineInput.batchId) {
          const match = (originalLine.stockAllocations ?? []).some(
            (allocation) =>
              allocation.batchId && String(allocation.batchId) === String(lineInput.batchId),
          );
          if (!match) {
            throw validationFailed(
              `lines[${index}]: batch must match an original sale allocation`,
              [
                {
                  field: `lines[${index}].batchId`,
                  message: 'batch identity must match the original sold batch',
                },
              ],
            );
          }
        }

        const allocation =
          lineInput.batchId
            ? (originalLine.stockAllocations ?? []).find(
                (item) => item.batchId && String(item.batchId) === String(lineInput.batchId),
              )
            : (originalLine.stockAllocations ?? [])[0];

        resolvedLines.push({
          productId: String(originalLine.productId),
          productNameSnapshot: String(originalLine.productNameSnapshot),
          packagingUnitId: originalLine.packagingUnitId
            ? String(originalLine.packagingUnitId)
            : null,
          unitCodeSnapshot: String(originalLine.unitCodeSnapshot),
          conversionFactorSnapshot: String(originalLine.conversionFactorSnapshot),
          enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          batchId: lineInput.batchId
            ? String(lineInput.batchId)
            : allocation?.batchId
              ? String(allocation.batchId)
              : null,
          batchNumber: allocation?.batchNumber ?? null,
          manufacturingDate: null,
          expiryDate: allocation?.expiryDate ?? null,
          originalLineIndex: lineInput.originalLineIndex,
          stockCondition: lineInput.stockCondition,
          unsellableReason: lineInput.unsellableReason,
          returnInventoryValueMinorUnits: null,
          receiptUnitCostMinorUnits: null,
          returnRevenueMinorUnits: null,
        });
      }

      return transactionRunner.run(async (session) => {
        const created = await store.insertReturn(session, {
          organizationId,
          returnType: 'sales',
          saleId: input.saleId,
          purchaseId: null,
          supplierId: null,
          customerId: sale.customerId,
          warehouseId: String(sale.warehouseId),
          reason: '',
          resolution: 'ledger_adjustment',
          refundAccountId: null,
          status: 'draft',
          lines: resolvedLines,
          returnTotalMinorUnits: null,
          currency: sale.currency ?? 'PKR',
          postedAt: null,
          postedBy: null,
          createdBy: authContext.userId,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'return.draft.created',
          resourceType: 'return',
          resourceId: String(created['_id']),
          metadata: {
            returnType: 'sales',
            saleId: input.saleId,
            lineCount: resolvedLines.length,
          },
        });

        return toReturnDto(created);
      });
    },

    async createWithoutInvoiceDraft(organizationId, body, authContext) {
      if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
        throw forbidden('Missing permission returns.post');
      }
      if (!catalogService || !locationsService) {
        throw validationFailed('Return-without-invoice lookup dependencies are not configured');
      }

      const input = parseWithoutInvoiceDraft(body);
      const warehouse = await locationsService.getWarehouse(organizationId, input.warehouseId);
      if (!warehouse || warehouse.status !== 'active') {
        throw validationFailed('Warehouse must be active', [
          { field: 'warehouseId', message: 'warehouse must be active' },
        ]);
      }
      await assertWarehouseAccess(authContext, input.warehouseId);

      let customerId = null;
      if (input.customerId) {
        if (!customersService) {
          throw validationFailed('customersService is required for customer lookup');
        }
        const customer = await customersService.getCustomer(organizationId, input.customerId);
        customerId = String(customer.id);
      }

      const resolvedLines = [];
      for (let index = 0; index < input.lines.length; index += 1) {
        const lineInput = input.lines[index];
        const product = await catalogService.getProduct(organizationId, lineInput.productId);
        if (product.status !== 'active') {
          throw validationFailed(`lines[${index}]: product must be active`, [
            { field: `lines[${index}].productId`, message: 'product must be active' },
          ]);
        }

        let conversionFactorSnapshot = '1';
        let unitCodeSnapshot = String(product.baseUnitCode);
        let packagingUnitId = null;
        if (lineInput.packagingUnitId) {
          const units = await catalogService.listPackagingUnits(organizationId, product.id);
          const unit = (units.items ?? []).find(
            (item) => String(item.id) === String(lineInput.packagingUnitId) && item.status === 'active',
          );
          if (!unit) {
            throw validationFailed(`lines[${index}]: packaging unit was not found for product`, [
              { field: `lines[${index}].packagingUnitId`, message: 'packaging unit not found' },
            ]);
          }
          packagingUnitId = String(unit.id);
          conversionFactorSnapshot = String(unit.conversionFactor);
          unitCodeSnapshot = String(unit.name);
        }

        let enteredQuantityMinorUnits;
        try {
          enteredQuantityMinorUnits = parseQuantityMinorUnits(lineInput.quantity);
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity is invalid`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }
        if (enteredQuantityMinorUnits <= 0n) {
          throw validationFailed(`lines[${index}].quantity must be greater than zero`, [
            { field: `lines[${index}].quantity`, message: 'quantity must be greater than zero' },
          ]);
        }

        let quantityBaseMinorUnits;
        try {
          quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
            enteredQuantityMinorUnits,
            conversionFactorSnapshot,
          );
        } catch (error) {
          throw validationFailed(`lines[${index}].quantity conversion failed`, [
            { field: `lines[${index}].quantity`, message: error.message },
          ]);
        }

        let batchNumber = null;
        let expiryDate = null;
        if (lineInput.batchId) {
          if (!inventoryService || typeof inventoryService.getBatch !== 'function') {
            throw validationFailed('inventoryService.getBatch is required for batch lookup');
          }
          const batch = await inventoryService.getBatch(organizationId, lineInput.batchId);
          if (String(batch.productId) !== String(product.id)) {
            throw validationFailed(`lines[${index}]: batch does not belong to the product`, [
              { field: `lines[${index}].batchId`, message: 'batch must belong to the product' },
            ]);
          }
          batchNumber = batch.batchNumber ?? null;
          expiryDate = batch.expiryDate ?? null;
        } else if (product.trackingMode !== 'none') {
          throw validationFailed(
            `lines[${index}]: batch identification is required for batch-tracked products`,
            [{ field: `lines[${index}].batchId`, message: 'batchId is required where identifiable' }],
          );
        }

        resolvedLines.push({
          productId: String(product.id),
          productNameSnapshot: String(product.name),
          packagingUnitId,
          unitCodeSnapshot,
          conversionFactorSnapshot,
          enteredQuantityMinorUnits: enteredQuantityMinorUnits.toString(),
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          batchId: lineInput.batchId,
          batchNumber,
          manufacturingDate: null,
          expiryDate,
          originalLineIndex: null,
          stockCondition: lineInput.stockCondition,
          unsellableReason: lineInput.unsellableReason,
          documentedUnitCostMinorUnits: lineInput.documentedUnitCostMinorUnits,
          returnInventoryValueMinorUnits: null,
          receiptUnitCostMinorUnits: null,
          returnRevenueMinorUnits: null,
        });
      }

      return transactionRunner.run(async (session) => {
        const created = await store.insertReturn(session, {
          organizationId,
          returnType: 'sales_without_invoice',
          saleId: null,
          purchaseId: null,
          supplierId: null,
          customerId,
          customerIdentifyingName: input.customerIdentifyingName,
          customerIdentifyingPhone: input.customerIdentifyingPhone,
          warehouseId: String(warehouse.id),
          reason: '',
          resolution: 'ledger_adjustment',
          refundAccountId: null,
          status: 'draft',
          lines: resolvedLines,
          returnTotalMinorUnits: null,
          currency: 'PKR',
          postedAt: null,
          postedBy: null,
          createdBy: authContext.userId,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'return.draft.created',
          resourceType: 'return',
          resourceId: String(created['_id']),
          metadata: {
            returnType: 'sales_without_invoice',
            warehouseId: String(warehouse.id),
            customerId,
            lineCount: resolvedLines.length,
          },
        });

        return toReturnDto(created);
      });
    },

    async updateReturnDraft(organizationId, returnId, body, authContext) {
      const existing = await store.findReturnById(organizationId, returnId);
      if (existing === null) {
        throw notFound('Return not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft returns can be updated');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Return not found');
      }

      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw validationFailed('Request body must be an object');
      }

      const expectedVersion =
        body.expectedVersion !== undefined
          ? (() => {
              const v = body.expectedVersion;
              if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
                throw validationFailed('expectedVersion must be a positive integer', [
                  { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
                ]);
              }
              return v;
            })()
          : Number(existing.version);

      assertOptimisticVersion(existing, expectedVersion);

      const patch = {};

      if (body.reason !== undefined) {
        if (typeof body.reason !== 'string') {
          throw validationFailed('reason must be a string', [
            { field: 'reason', message: 'reason must be a string' },
          ]);
        }
        patch.reason = body.reason.trim().slice(0, 1000);
      }

      if (body.resolution !== undefined) {
        if (
          body.resolution !== 'ledger_adjustment' &&
          body.resolution !== 'account_refund'
        ) {
          throw validationFailed('resolution must be ledger_adjustment or account_refund', [
            { field: 'resolution', message: 'invalid resolution value' },
          ]);
        }
        patch.resolution = body.resolution;
      }

      if (body.refundAccountId !== undefined) {
        patch.refundAccountId =
          body.refundAccountId === null || body.refundAccountId === ''
            ? null
            : String(body.refundAccountId).trim();
      }

      return transactionRunner.run(async (session) => {
        const updated = await store.updateReturnIfDraft(
          session,
          organizationId,
          returnId,
          expectedVersion,
          { ...patch, updatedAt: now() },
        );
        if (updated === null) {
          throw conflict('Return was modified by another request or is no longer a draft');
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'return.draft.updated',
          resourceType: 'return',
          resourceId: returnId,
          metadata: { version: Number(existing.version) + 1 },
        });

        return toReturnDto(updated);
      });
    },

    async discardReturnDraft(organizationId, returnId, authContext) {
      const existing = await store.findReturnById(organizationId, returnId);
      if (existing === null) {
        throw notFound('Return not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft returns can be discarded');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Return not found');
      }
      const deleted = await store.deleteReturnIfDraft(null, organizationId, returnId);
      if (!deleted) {
        throw conflict('Only draft returns can be discarded');
      }
      await auditWriter.appendBusinessEvent(null, {
        organizationId,
        actorId: authContext.userId,
        action: 'return.draft.discarded',
        resourceType: 'return',
        resourceId: returnId,
        metadata: {},
      });
      return { id: returnId, discarded: true };
    },

    async postReturn(organizationId, returnId, body, authContext, idempotencyKey) {
      if (!inventoryService || !paymentsService) {
        throw validationFailed('Return posting dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseReturnPost(body);
      const actor = { actorId: String(authContext.userId) };

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'returns.post',
        },
        key,
        { returnId, expectedVersion: input.expectedVersion },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findReturnById(organizationId, returnId, session);
            if (existing === null) {
              throw notFound('Return not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft returns can be posted');
            }
            assertOptimisticVersion(existing, input.expectedVersion);

            if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
              throw forbidden('Missing permission returns.post');
            }

            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Return not found');
            }

            await assertWarehouseAccess(authContext, String(existing.warehouseId));

            const returnType = String(existing.returnType);
            let posted;
            if (returnType === 'purchase') {
              posted = await postPurchaseReturnInSession(
                session,
                organizationId,
                actor,
                returnId,
                existing,
                input,
                authContext,
              );
            } else if (returnType === 'sales') {
              posted = await postSalesLinkedReturnInSession(
                session,
                organizationId,
                actor,
                returnId,
                existing,
                input,
                authContext,
              );
            } else if (returnType === 'sales_without_invoice') {
              posted = await postWithoutInvoiceReturnInSession(
                session,
                organizationId,
                actor,
                returnId,
                existing,
                input,
                authContext,
              );
            } else {
              throw validationFailed('Unsupported return type');
            }

            const updated = await store.updateReturnIfPosted(session, organizationId, returnId, {
              reason: input.reason,
              resolution: input.resolution,
              refundAccountId: input.refundAccountId ?? null,
              lines: posted.postedLines,
              returnTotalMinorUnits: posted.returnTotal.toString(),
              status: 'posted',
              postedAt: posted.postedAt,
              postedBy: actor.actorId,
              updatedAt: posted.postedAt,
              ...(posted.extraPatch ?? {}),
            });
            if (updated === null) {
              throw conflict('Return was already posted or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'return.posted',
              resourceType: 'return',
              resourceId: returnId,
              metadata: {
                returnType,
                sourceType: returnType === 'purchase' ? 'purchase' : returnType === 'sales' ? 'sale' : 'return',
                sourceId:
                  returnType === 'purchase'
                    ? existing.purchaseId
                      ? String(existing.purchaseId)
                      : null
                    : existing.saleId
                      ? String(existing.saleId)
                      : String(returnId),
                purchaseId: existing.purchaseId ? String(existing.purchaseId) : null,
                saleId: existing.saleId ? String(existing.saleId) : null,
                returnTotalMinorUnits: posted.returnTotal.toString(),
                resolution: input.resolution,
                lineCount: posted.postedLines.length,
                approverId:
                  returnType === 'sales_without_invoice' ? actor.actorId : undefined,
                reason: input.reason,
              },
            });

            return toReturnDto(updated);
          });

          return { statusCode: 200, body: dto };
        },
      );

      return {
        replay: result.replay,
        data: result.response.body,
        statusCode: result.response.statusCode,
      };
    },

    async reverseReturn(organizationId, returnId, body, authContext, idempotencyKey) {
      if (!hasPermission(authContext?.permissions ?? [], 'returns.reverse')) {
        throw forbidden('Missing permission returns.reverse');
      }
      if (!inventoryService || !paymentsService || !accountsService) {
        throw validationFailed('Return reversal dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseReturnReverse(body);
      const actor = { actorId: String(authContext.userId) };

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'returns.reverse',
        },
        key,
        { returnId, expectedVersion: input.expectedVersion },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findReturnById(organizationId, returnId, session);
            if (existing === null) {
              throw notFound('Return not found');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Return not found');
            }
            if (existing.status === 'reversed') {
              throw conflict('Return has already been reversed');
            }
            if (existing.status !== 'posted') {
              throw conflict('Only posted returns can be reversed');
            }
            if (
              existing.reversedByCorrectiveTransactionId !== null &&
              existing.reversedByCorrectiveTransactionId !== undefined
            ) {
              throw conflict('Return has already been reversed');
            }
            assertOptimisticVersion(existing, input.expectedVersion);
            await assertWarehouseAccess(authContext, String(existing.warehouseId));

            const postedAt = now();
            let corrective;
            try {
              corrective = await store.insertCorrectiveTransaction(session, {
                organizationId,
                sourceType: 'return',
                sourceId: existing['_id'],
                reversalOfId: existing['_id'],
                reason: input.reason,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              if (error && error.agrivioDuplicate === true) {
                throw conflict('Return has already been reversed');
              }
              throw error;
            }

            const correctiveId = String(corrective['_id']);
            await reverseLinkedEffects(
              session,
              organizationId,
              actor,
              existing,
              correctiveId,
              input.reason,
              postedAt,
            );

            const updated = await store.updateReturnIfPostedUnreversed(
              session,
              organizationId,
              returnId,
              input.expectedVersion,
              {
                status: 'reversed',
                reversedByCorrectiveTransactionId: corrective['_id'],
                reversedAt: postedAt,
                reversedBy: actor.actorId,
                updatedAt: postedAt,
              },
            );
            if (updated === null) {
              throw conflict('Return was already reversed or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'return.reversed',
              resourceType: 'return',
              resourceId: returnId,
              reason: input.reason,
              metadata: {
                returnType: String(existing.returnType),
                sourceType: 'return',
                sourceId: returnId,
                reversalOfId: returnId,
                correctiveTransactionId: correctiveId,
                purchaseId: existing.purchaseId ? String(existing.purchaseId) : null,
                saleId: existing.saleId ? String(existing.saleId) : null,
              },
            });

            return toReturnDto(updated);
          });

          return { statusCode: 200, body: dto };
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

function createReturnsModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseReturnsStore() : createInMemoryReturnsStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);

  const returnsService = createReturnsService({
    store,
    persistence,
    transactionRunner,
    inventoryService: options.inventoryService,
    paymentsService: options.paymentsService,
    accountsService: options.accountsService,
    purchasesService: options.purchasesService,
    salesService: options.salesService,
    catalogService: options.catalogService,
    customersService: options.customersService,
    locationsService: options.locationsService,
    canAccessWarehouse: options.canAccessWarehouse,
    ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    store,
    returnsService,
    transactionRunner,
    async listPurchaseReturnCredits(organizationId, purchaseId) {
      const items = await store.listPostedReturnsByPurchase(organizationId, purchaseId);
      let total = 0n;
      for (const item of items) {
        total += BigInt(String(item.returnTotalMinorUnits ?? '0'));
      }
      return total.toString();
    },
    async listPostedReturnsByPurchase(organizationId, purchaseId) {
      return store.listPostedReturnsByPurchase(organizationId, purchaseId);
    },
    async listPostedReturnsBySale(organizationId, saleId) {
      return store.listPostedReturnsBySale(organizationId, saleId);
    },
  };
}

module.exports = {
  createReturnsService,
  createReturnsModule,
  createInMemoryReturnsStore,
  createMongooseReturnsStore,
};
