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
const {
  convertEnteredQuantityToBaseMinorUnits,
  computeUnitCostMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const {
  parsePurchaseDraft,
  parsePurchasePost,
  parsePurchaseCancel,
  computeLineProductAmount,
  toPurchaseDto,
} = require('./purchases.validation');
const {
  allocateLandedCosts,
  sumLandedCostComponents,
} = require('./landed-cost-allocation');
const {
  createInMemoryPurchasesStore,
  createMongoosePurchasesStore,
} = require('./purchases.store');

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

function assertActiveProduct(product) {
  if (product.status !== 'active') {
    throw validationFailed('Product must be active', [
      { field: 'productId', message: 'product must be active' },
    ]);
  }
}

function assertActiveWarehouse(warehouse) {
  if (warehouse.status !== 'active') {
    throw validationFailed('Warehouse must be active', [
      { field: 'warehouseId', message: 'warehouse must be active' },
    ]);
  }
}

function assertActiveSupplier(supplier) {
  if (supplier.status !== 'active') {
    throw validationFailed('Supplier must be active', [
      { field: 'supplierId', message: 'supplier must be active' },
    ]);
  }
}

function assertBatchExpiryFacts(product, line, fieldPrefix) {
  const mode = product.trackingMode;
  if (mode === 'none') {
    if (line.batchNumber !== null) {
      throw validationFailed('batchNumber is not allowed for products without batch tracking', [
        { field: `${fieldPrefix}.batchNumber`, message: 'batchNumber is not allowed' },
      ]);
    }
    if (line.expiryDate !== null || line.manufacturingDate !== null) {
      throw validationFailed('expiry/manufacturing dates are not allowed for trackingMode none', [
        { field: `${fieldPrefix}.expiryDate`, message: 'dates are not allowed' },
      ]);
    }
    return;
  }

  if (line.batchNumber === null) {
    throw validationFailed('batchNumber is required for batch-tracked products', [
      { field: `${fieldPrefix}.batchNumber`, message: 'batchNumber is required' },
    ]);
  }

  if (mode === 'batch_expiry' && line.expiryDate === null) {
    throw validationFailed('expiryDate is required for batch_expiry tracking', [
      { field: `${fieldPrefix}.expiryDate`, message: 'expiryDate is required' },
    ]);
  }
}

async function resolveUnitSnapshot(catalogService, organizationId, product, packagingUnitId) {
  if (packagingUnitId === null) {
    return {
      packagingUnitId: null,
      unitCode: product.baseUnitCode,
      conversionFactorSnapshot: '1',
    };
  }

  const packaging = await catalogService.listPackagingUnits(organizationId, product.id);
  const unit = packaging.items.find((item) => item.id === packagingUnitId);
  if (unit === undefined) {
    throw notFound('Packaging unit not found');
  }
  if (unit.status !== 'active') {
    throw validationFailed('Packaging unit must be active', [
      { field: 'packagingUnitId', message: 'packaging unit must be active' },
    ]);
  }
  return {
    packagingUnitId: unit.id,
    unitCode: unit.name,
    conversionFactorSnapshot: unit.conversionFactor,
  };
}

async function buildResolvedLines(deps, organizationId, lines) {
  const resolved = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const product = await deps.catalogService.getProduct(organizationId, line.productId);
    assertActiveProduct(product);
    assertBatchExpiryFacts(product, line, `lines[${index}]`);

    const unitSnapshot = await resolveUnitSnapshot(
      deps.catalogService,
      organizationId,
      product,
      line.packagingUnitId,
    );
    let quantityBaseMinorUnits;
    try {
      quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
        BigInt(line.enteredQuantityMinorUnits),
        unitSnapshot.conversionFactorSnapshot,
      );
    } catch (error) {
      throw validationFailed(error.message || 'Invalid quantity conversion', [
        { field: `lines[${index}].quantity`, message: error.message || 'Invalid quantity conversion' },
      ]);
    }

    resolved.push({
      productId: product.id,
      productNameSnapshot: product.name,
      trackingModeSnapshot: product.trackingMode,
      packagingUnitId: unitSnapshot.packagingUnitId,
      unitCodeSnapshot: unitSnapshot.unitCode,
      conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
      enteredQuantityMinorUnits: line.enteredQuantityMinorUnits,
      quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
      unitCostMinorUnits: line.unitCostMinorUnits,
      lineProductAmountMinorUnits: computeLineProductAmount(
        line.enteredQuantityMinorUnits,
        line.unitCostMinorUnits,
        unitSnapshot.conversionFactorSnapshot,
      ),
      batchNumber: line.batchNumber,
      manufacturingDate: line.manufacturingDate,
      expiryDate: line.expiryDate,
    });
  }
  return resolved;
}

function createPurchasesService(deps) {
  const store = deps.store;
  const catalogService = deps.catalogService;
  const suppliersService = deps.suppliersService;
  const locationsService = deps.locationsService;
  const inventoryService = deps.inventoryService;
  const paymentsService = deps.paymentsService;
  const accountsService = deps.accountsService;
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

  async function assertBranchAccess(authContext, branchId) {
    if (branchId === null || branchId === undefined) {
      return;
    }
    if (typeof deps.canAccessBranch === 'function') {
      if (!deps.canAccessBranch(authContext, String(branchId))) {
        throw forbidden('Branch assignment is required');
      }
    }
  }

  async function resolveHeaderMasters(organizationId, input, authContext) {
    const warehouse = await locationsService.getWarehouse(organizationId, input.warehouseId);
    assertActiveWarehouse(warehouse);
    await assertWarehouseAccess(authContext, input.warehouseId);

    const supplier = await suppliersService.getSupplier(organizationId, input.supplierId);
    assertActiveSupplier(supplier);

    let branch = null;
    if (input.branchId) {
      branch = await locationsService.getBranch(organizationId, input.branchId);
      if (branch.status !== 'active') {
        throw validationFailed('Branch must be active', [
          { field: 'branchId', message: 'branch must be active' },
        ]);
      }
      await assertBranchAccess(authContext, input.branchId);
    }

    return { warehouse, supplier, branch };
  }

  async function refreshLineSnapshotsForPost(organizationId, lines) {
    const refreshed = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = await catalogService.getProduct(organizationId, String(line.productId));
      assertActiveProduct(product);
      assertBatchExpiryFacts(
        product,
        {
          batchNumber: line.batchNumber ?? null,
          manufacturingDate: line.manufacturingDate ?? null,
          expiryDate: line.expiryDate ?? null,
        },
        `lines[${index}]`,
      );

      const packagingUnitId = line.packagingUnitId ? String(line.packagingUnitId) : null;
      if (packagingUnitId !== null) {
        const packaging = await catalogService.listPackagingUnits(organizationId, product.id);
        const unit = packaging.items.find((item) => item.id === packagingUnitId);
        if (unit === undefined) {
          throw notFound('Packaging unit not found');
        }
      }

      refreshed.push({
        productId: product.id,
        productNameSnapshot: String(line.productNameSnapshot || product.name),
        trackingModeSnapshot: product.trackingMode,
        packagingUnitId,
        unitCodeSnapshot: String(line.unitCodeSnapshot),
        conversionFactorSnapshot: String(line.conversionFactorSnapshot),
        enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
        quantityBaseMinorUnits: String(line.quantityBaseMinorUnits),
        unitCostMinorUnits: String(line.unitCostMinorUnits),
        lineProductAmountMinorUnits: String(line.lineProductAmountMinorUnits),
        batchNumber: line.batchNumber ?? null,
        manufacturingDate: line.manufacturingDate ?? null,
        expiryDate: line.expiryDate ?? null,
      });
    }
    return refreshed;
  }

  return {
    async listPurchases(organizationId, query = {}, authContext) {
      const items = await store.listPurchases(organizationId, {
        status: query.status,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
      });
      const filtered = [];
      for (const item of items) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(item.warehouseId))
        ) {
          continue;
        }
        filtered.push(toPurchaseDto(item));
      }
      return { items: filtered };
    },

    async getPurchase(organizationId, purchaseId, authContext) {
      const record = await store.findPurchaseById(organizationId, purchaseId);
      if (record === null) {
        throw notFound('Purchase not found');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(record.warehouseId))
      ) {
        throw notFound('Purchase not found');
      }
      return toPurchaseDto(record);
    },

    async createPurchaseDraft(organizationId, body, authContext) {
      const input = parsePurchaseDraft(body);
      const { supplier } = await resolveHeaderMasters(organizationId, input, authContext);
      const lines = await buildResolvedLines({ catalogService }, organizationId, input.lines);

      return transactionRunner.run(async (session) => {
        const created = await store.insertPurchase(session, {
          organizationId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          supplierId: input.supplierId,
          supplierNameSnapshot: supplier.name,
          supplierInvoiceReference: input.supplierInvoiceReference,
          supplierInvoiceReferenceNormalized: input.supplierInvoiceReferenceNormalized,
          purchaseDate: input.purchaseDate,
          notes: input.notes,
          lines,
          landedCosts: input.landedCosts,
          status: 'draft',
          postedAt: null,
          postedBy: null,
          createdBy: authContext.userId,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'purchase.draft.created',
          resourceType: 'purchase',
          resourceId: String(created['_id']),
          metadata: {
            supplierId: input.supplierId,
            warehouseId: input.warehouseId,
            lineCount: lines.length,
          },
        });

        return toPurchaseDto(created);
      });
    },

    async updatePurchaseDraft(organizationId, purchaseId, body, authContext) {
      const existing = await store.findPurchaseById(organizationId, purchaseId);
      if (existing === null) {
        throw notFound('Purchase not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft purchases can be updated');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Purchase not found');
      }

      const input = parsePurchaseDraft(body, { partial: true });
      assertOptimisticVersion(existing, input.expectedVersion);

      const next = {
        warehouseId: input.warehouseId ?? String(existing.warehouseId),
        supplierId: input.supplierId ?? String(existing.supplierId),
        branchId:
          input.branchId !== undefined
            ? input.branchId
            : existing.branchId
              ? String(existing.branchId)
              : null,
        purchaseDate: input.purchaseDate ?? String(existing.purchaseDate),
        supplierInvoiceReference:
          input.supplierInvoiceReference !== undefined
            ? input.supplierInvoiceReference
            : String(existing.supplierInvoiceReference ?? ''),
        supplierInvoiceReferenceNormalized:
          input.supplierInvoiceReferenceNormalized !== undefined
            ? input.supplierInvoiceReferenceNormalized
            : String(existing.supplierInvoiceReferenceNormalized ?? ''),
        notes: input.notes !== undefined ? input.notes : String(existing.notes ?? ''),
        landedCosts: input.landedCosts ?? existing.landedCosts,
      };

      const { supplier } = await resolveHeaderMasters(organizationId, next, authContext);
      const lineInputs =
        input.lines ??
        existing.lines.map((line) => ({
          productId: String(line.productId),
          packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
          enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
          unitCostMinorUnits: String(line.unitCostMinorUnits),
          batchNumber: line.batchNumber ?? null,
          manufacturingDate: line.manufacturingDate ?? null,
          expiryDate: line.expiryDate ?? null,
        }));
      const lines = await buildResolvedLines({ catalogService }, organizationId, lineInputs);

      return transactionRunner.run(async (session) => {
        const updated = await store.updatePurchase(session, organizationId, purchaseId, {
          ...next,
          supplierNameSnapshot: supplier.name,
          lines,
          version: Number(existing.version) + 1,
          updatedAt: now(),
        });
        if (updated === null) {
          throw conflict('Purchase was modified by another request');
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'purchase.draft.updated',
          resourceType: 'purchase',
          resourceId: purchaseId,
          metadata: { version: Number(existing.version) + 1 },
        });

        return toPurchaseDto(updated);
      });
    },

    async discardPurchaseDraft(organizationId, purchaseId, authContext) {
      const existing = await store.findPurchaseById(organizationId, purchaseId);
      if (existing === null) {
        throw notFound('Purchase not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft purchases can be discarded');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Purchase not found');
      }

      return transactionRunner.run(async (session) => {
        const deleted = await store.deletePurchase(session, organizationId, purchaseId);
        if (!deleted) {
          throw conflict('Only draft purchases can be discarded');
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'purchase.draft.discarded',
          resourceType: 'purchase',
          resourceId: purchaseId,
          metadata: {},
        });

        return { id: purchaseId, discarded: true };
      });
    },

    async postPurchase(organizationId, purchaseId, body, authContext, idempotencyKey) {
      if (!inventoryService || !paymentsService || !accountsService) {
        throw validationFailed('Purchase posting dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parsePurchasePost(body);
      const actor = { actorId: String(authContext.userId) };

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'purchases.post',
        },
        key,
        {
          purchaseId,
          expectedVersion: input.expectedVersion,
          payments: input.payments,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findPurchaseById(organizationId, purchaseId);
            if (existing === null) {
              throw notFound('Purchase not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft purchases can be posted');
            }
            assertOptimisticVersion(existing, input.expectedVersion);
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Purchase not found');
            }

            const { warehouse, supplier, branch } = await resolveHeaderMasters(
              organizationId,
              {
                warehouseId: String(existing.warehouseId),
                supplierId: String(existing.supplierId),
                branchId: existing.branchId ? String(existing.branchId) : null,
              },
              authContext,
            );

            const lines = await refreshLineSnapshotsForPost(organizationId, existing.lines);
            const goodsTotal = lines.reduce(
              (sum, line) => sum + BigInt(line.lineProductAmountMinorUnits),
              0n,
            );
            const landedCostTotal = BigInt(sumLandedCostComponents(existing.landedCosts));
            const landedAllocations = allocateLandedCosts(lines, landedCostTotal.toString());
            const purchaseTotal = goodsTotal + landedCostTotal;

            let paidTotal = 0n;
            for (const payment of input.payments) {
              paidTotal += BigInt(payment.amountMinorUnits);
            }
            if (paidTotal > purchaseTotal) {
              throw validationFailed('Payment total cannot exceed purchase total', [
                { field: 'payments', message: 'paid amount cannot exceed purchase total' },
              ]);
            }
            const payableTotal = purchaseTotal - paidTotal;
            const postedAt = now();
            const postedLines = [];

            for (let index = 0; index < lines.length; index += 1) {
              const line = lines[index];
              const allocatedLanded = BigInt(landedAllocations[index]);
              const receiptInventoryValue =
                BigInt(line.lineProductAmountMinorUnits) + allocatedLanded;
              const receiptUnitCost = computeUnitCostMinorUnits(
                receiptInventoryValue,
                BigInt(line.quantityBaseMinorUnits),
              );

              const receipt = await inventoryService.postInboundReceiptInSession(
                session,
                organizationId,
                actor,
                {
                  warehouseId: String(existing.warehouseId),
                  productId: line.productId,
                  batchNumber: line.batchNumber,
                  manufacturingDate: line.manufacturingDate,
                  expiryDate: line.expiryDate,
                  quantityBaseMinorUnits: line.quantityBaseMinorUnits,
                  enteredQuantityMinorUnits: line.enteredQuantityMinorUnits,
                  unitCode: line.unitCodeSnapshot,
                  conversionFactorSnapshot: line.conversionFactorSnapshot,
                  packagingUnitId: line.packagingUnitId,
                  inventoryValueMinorUnits: receiptInventoryValue.toString(),
                  sourceType: 'purchase',
                  sourceId: purchaseId,
                  postedAt,
                },
              );

              postedLines.push({
                ...line,
                allocatedLandedCostMinorUnits: allocatedLanded.toString(),
                receiptInventoryValueMinorUnits: receiptInventoryValue.toString(),
                receiptUnitCostMinorUnits: receiptUnitCost.toString(),
                batchIdSnapshot: receipt.batchId,
              });
            }

            await paymentsService.postSupplierPayableEffect(session, {
              organizationId,
              supplierId: String(existing.supplierId),
              signedAmountMinorUnits: purchaseTotal.toString(),
              sourceType: 'purchase_payable',
              sourceId: purchaseId,
              postedAt,
              postedBy: actor.actorId,
            });

            const paymentSnapshots = [];
            for (const payment of input.payments) {
              const account = await accountsService.getAccount(organizationId, payment.accountId);
              if (account.status !== 'active') {
                throw validationFailed('Account must be active', [
                  { field: 'payments', message: 'account must be active' },
                ]);
              }

              const paymentResult = await paymentsService.postSupplierPaymentInSession(session, {
                organizationId,
                supplierId: String(existing.supplierId),
                accountId: payment.accountId,
                allocationMode: 'invoice_specific',
                amountMinorUnits: payment.amountMinorUnits,
                paymentDate: String(existing.purchaseDate),
                notes: '',
                purchaseAllocations: [
                  {
                    purchaseId,
                    allocatedAmountMinorUnits: payment.amountMinorUnits,
                  },
                ],
                advanceAmountMinorUnits: '0',
                postedAt,
                postedBy: actor.actorId,
                postAccountMovement: false,
              });

              await accountsService.postAccountMovement(session, {
                organizationId,
                accountId: payment.accountId,
                signedAmountMinorUnits: `-${payment.amountMinorUnits}`,
                sourceType: 'purchase_payment',
                sourceId: String(paymentResult.payment['_id']),
                postedAt,
                postedBy: actor.actorId,
              });

              paymentSnapshots.push({
                accountId: payment.accountId,
                accountNameSnapshot: account.name,
                accountTypeSnapshot: account.accountType,
                amountMinorUnits: payment.amountMinorUnits,
                paymentId: paymentResult.payment['_id'],
              });
            }

            const updated = await store.updatePurchaseIfDraft(
              session,
              organizationId,
              purchaseId,
              input.expectedVersion,
              {
                supplierNameSnapshot: supplier.name,
                warehouseNameSnapshot: warehouse.name,
                branchNameSnapshot: branch ? branch.name : null,
                lines: postedLines,
                goodsTotalMinorUnits: goodsTotal.toString(),
                landedCostTotalMinorUnits: landedCostTotal.toString(),
                purchaseTotalMinorUnits: purchaseTotal.toString(),
                paidTotalMinorUnits: paidTotal.toString(),
                payableTotalMinorUnits: payableTotal.toString(),
                paymentSnapshots,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                updatedAt: postedAt,
              },
            );
            if (updated === null) {
              throw conflict('Purchase was already posted or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'purchase.posted',
              resourceType: 'purchase',
              resourceId: purchaseId,
              metadata: {
                purchaseTotalMinorUnits: purchaseTotal.toString(),
                paidTotalMinorUnits: paidTotal.toString(),
                payableTotalMinorUnits: payableTotal.toString(),
                lineCount: postedLines.length,
              },
            });

            return toPurchaseDto(updated);
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

    async listUnpaidSupplierPurchases(organizationId, supplierId) {
      const items = await store.listPurchases(organizationId, {
        status: 'posted',
        supplierId,
      });
      const result = [];
      for (const item of items) {
        if (!item.purchaseTotalMinorUnits) {
          continue;
        }
        const purchaseTotal = BigInt(String(item.purchaseTotalMinorUnits));
        const allocations =
          paymentsService && typeof paymentsService.listPurchaseAllocations === 'function'
            ? await paymentsService.listPurchaseAllocations(organizationId, String(item['_id']))
            : [];
        const allocated = allocations.reduce(
          (sum, a) => sum + BigInt(a.allocatedAmountMinorUnits),
          0n,
        );
        let outstanding = purchaseTotal - allocated;
        if (typeof deps.listPurchaseReturnCredits === 'function') {
          const returnCredit = BigInt(
            String(
              (await deps.listPurchaseReturnCredits(organizationId, String(item['_id']))) ?? '0',
            ),
          );
          outstanding -= returnCredit;
        }
        if (outstanding <= 0n) {
          continue;
        }
        result.push({
          id: String(item['_id']),
          outstandingMinorUnits: outstanding.toString(),
          purchaseDate: String(item.purchaseDate),
          dueDate: null,
          sequence:
            item.createdAt instanceof Date
              ? item.createdAt.toISOString()
              : String(item.createdAt ?? ''),
        });
      }
      return result;
    },

    async getPurchaseSourceForReturn(organizationId, purchaseId) {
      const record = await store.findPurchaseById(organizationId, purchaseId);
      if (record === null) {
        throw notFound('Purchase not found');
      }
      if (record.status !== 'posted') {
        throw conflict('Purchase must be posted to be used as a return source');
      }
      return {
        id: String(record['_id']),
        status: String(record['status']),
        supplierId: String(record['supplierId']),
        warehouseId: String(record['warehouseId']),
        purchaseDate: String(record['purchaseDate']),
        purchaseTotalMinorUnits: String(record['purchaseTotalMinorUnits']),
        lines: (record.lines ?? []).map((line) => ({
          productId: String(line.productId),
          productNameSnapshot: String(line.productNameSnapshot),
          trackingModeSnapshot: String(line.trackingModeSnapshot),
          packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
          unitCodeSnapshot: String(line.unitCodeSnapshot),
          conversionFactorSnapshot: String(line.conversionFactorSnapshot),
          quantityBaseMinorUnits: String(line.quantityBaseMinorUnits),
          enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
          unitCostMinorUnits: String(line.unitCostMinorUnits),
          receiptInventoryValueMinorUnits: String(line.receiptInventoryValueMinorUnits ?? '0'),
          receiptUnitCostMinorUnits: String(line.receiptUnitCostMinorUnits ?? '0'),
          batchNumber: line.batchNumber ?? null,
          manufacturingDate: line.manufacturingDate ?? null,
          expiryDate: line.expiryDate ?? null,
          batchId: line.batchIdSnapshot ? String(line.batchIdSnapshot) : null,
        })),
      };
    },

    async cancelPurchase(organizationId, purchaseId, body, authContext, idempotencyKey) {
      if (!inventoryService || !paymentsService || !accountsService) {
        throw validationFailed('Purchase cancellation dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parsePurchaseCancel(body);
      const actor = { actorId: String(authContext.userId) };

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'purchases.cancel',
        },
        key,
        {
          purchaseId,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findPurchaseById(organizationId, purchaseId);
            if (existing === null) {
              throw notFound('Purchase not found');
            }
            if (existing.status !== 'posted') {
              throw conflict('Only posted purchases can be cancelled');
            }
            if (Number(existing.version) !== Number(input.expectedVersion)) {
              throw conflict('Purchase was modified by another request');
            }

            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Purchase not found');
            }

            if (typeof deps.listPostedReturnsByPurchase === 'function') {
              const dependentReturns = await deps.listPostedReturnsByPurchase(
                organizationId,
                purchaseId,
              );
              if (Array.isArray(dependentReturns) && dependentReturns.length > 0) {
                throw conflict(
                  'Purchase cannot be cancelled because posted purchase returns exist; use approved corrective workflows',
                );
              }
            }

            const cancelledAt = now();
            const purchaseTotal = BigInt(String(existing.purchaseTotalMinorUnits));

            for (const line of existing.lines) {
              await inventoryService.postOutboundIssueInSession(session, organizationId, actor, {
                warehouseId: String(existing.warehouseId),
                productId: String(line.productId),
                batchId: line.batchIdSnapshot ? String(line.batchIdSnapshot) : null,
                quantityBaseMinorUnits: String(line.quantityBaseMinorUnits),
                enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
                unitCode: String(line.unitCodeSnapshot),
                conversionFactorSnapshot: String(line.conversionFactorSnapshot),
                packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
                inventoryValueMinorUnits: String(line.receiptInventoryValueMinorUnits),
                useExplicitOutboundValue: true,
                sourceType: 'purchase_cancellation',
                sourceId: purchaseId,
                reason: input.reason,
                postedAt: cancelledAt,
              });
            }

            await paymentsService.postSupplierPayableEffect(session, {
              organizationId,
              supplierId: String(existing.supplierId),
              signedAmountMinorUnits: `-${purchaseTotal.toString()}`,
              sourceType: 'purchase_cancellation',
              sourceId: purchaseId,
              postedAt: cancelledAt,
              postedBy: actor.actorId,
            });

            const priorAllocations = await paymentsService.listPurchaseAllocations(
              organizationId,
              purchaseId,
            );

            for (const allocation of priorAllocations) {
              await paymentsService.postSupplierPayableEffect(session, {
                organizationId,
                supplierId: String(existing.supplierId),
                signedAmountMinorUnits: allocation.allocatedAmountMinorUnits,
                sourceType: 'purchase_cancellation_allocation_reversal',
                sourceId: String(allocation['_id']),
                postedAt: cancelledAt,
                postedBy: actor.actorId,
              });

              const payment = await paymentsService.getSupplierPaymentRaw(
                organizationId,
                String(allocation.paymentId),
              );
              if (payment) {
                await accountsService.postAccountMovement(session, {
                  organizationId,
                  accountId: String(payment.accountId),
                  signedAmountMinorUnits: allocation.allocatedAmountMinorUnits,
                  sourceType: 'purchase_cancellation_refund',
                  sourceId: String(allocation['_id']),
                  postedAt: cancelledAt,
                  postedBy: actor.actorId,
                });
              }
            }

            const updated = await store.updatePurchaseIfPosted(
              session,
              organizationId,
              purchaseId,
              input.expectedVersion,
              {
                status: 'cancelled',
                cancellationReason: input.reason,
                cancelledAt,
                cancelledBy: actor.actorId,
                updatedAt: cancelledAt,
              },
            );
            if (updated === null) {
              throw conflict('Purchase was already cancelled or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'purchase.cancelled',
              resourceType: 'purchase',
              resourceId: purchaseId,
              metadata: {
                reason: input.reason,
                purchaseTotalMinorUnits: purchaseTotal.toString(),
                priorAllocationsCount: priorAllocations.length,
              },
            });

            return toPurchaseDto(updated);
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

function createPurchasesModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongoosePurchasesStore() : createInMemoryPurchasesStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const purchasesService = createPurchasesService({
    store,
    persistence,
    transactionRunner,
    catalogService: options.catalogService,
    suppliersService: options.suppliersService,
    locationsService: options.locationsService,
    inventoryService: options.inventoryService,
    paymentsService: options.paymentsService,
    accountsService: options.accountsService,
    canAccessWarehouse: options.canAccessWarehouse,
    canAccessBranch: options.canAccessBranch,
    ...(options.listPurchaseReturnCredits === undefined
      ? {}
      : { listPurchaseReturnCredits: options.listPurchaseReturnCredits }),
    ...(options.listPostedReturnsByPurchase === undefined
      ? {}
      : { listPostedReturnsByPurchase: options.listPostedReturnsByPurchase }),
    ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, purchasesService, transactionRunner };
}

module.exports = {
  createPurchasesService,
  createPurchasesModule,
  createInMemoryPurchasesStore,
  createMongoosePurchasesStore,
};
