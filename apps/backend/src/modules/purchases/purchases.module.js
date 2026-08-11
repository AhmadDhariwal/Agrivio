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
} = require('../../platform/primitives/money-and-time');
const {
  parsePurchaseDraft,
  computeLineProductAmount,
  toPurchaseDto,
} = require('./purchases.validation');
const {
  createInMemoryPurchasesStore,
  createMongoosePurchasesStore,
} = require('./purchases.store');

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
  const transactionRunner = deps.transactionRunner;
  const now = deps.now ?? (() => new Date());
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

    if (input.branchId) {
      const branch = await locationsService.getBranch(organizationId, input.branchId);
      if (branch.status !== 'active') {
        throw validationFailed('Branch must be active', [
          { field: 'branchId', message: 'branch must be active' },
        ]);
      }
      await assertBranchAccess(authContext, input.branchId);
    }

    return { warehouse, supplier };
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
      const lines = await buildResolvedLines(
        { catalogService },
        organizationId,
        input.lines,
      );

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
    transactionRunner,
    catalogService: options.catalogService,
    suppliersService: options.suppliersService,
    locationsService: options.locationsService,
    canAccessWarehouse: options.canAccessWarehouse,
    canAccessBranch: options.canAccessBranch,
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
