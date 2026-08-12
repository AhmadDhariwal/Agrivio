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
  parseSaleDraft,
  computeLineProductAmount,
  toSaleDto,
} = require('./sales.validation');
const { formatInvoiceNumber } = require('./invoice-sequence');
const {
  createInMemorySalesStore,
  createMongooseSalesStore,
} = require('./sales.store');

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

function assertActiveCustomer(customer) {
  if (customer.status !== 'active') {
    throw validationFailed('Customer must be active', [
      { field: 'customerId', message: 'customer must be active' },
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
      packagingUnitId: unitSnapshot.packagingUnitId,
      unitCodeSnapshot: unitSnapshot.unitCode,
      conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
      enteredQuantityMinorUnits: line.enteredQuantityMinorUnits,
      quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
      unitPriceMinorUnits: line.unitPriceMinorUnits,
      lineProductAmountMinorUnits: computeLineProductAmount(
        line.enteredQuantityMinorUnits,
        line.unitPriceMinorUnits,
        unitSnapshot.conversionFactorSnapshot,
      ),
    });
  }
  return resolved;
}

function createSalesService(deps) {
  const store = deps.store;
  const catalogService = deps.catalogService;
  const customersService = deps.customersService;
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
    if (typeof deps.canAccessBranch === 'function') {
      if (!deps.canAccessBranch(authContext, String(branchId))) {
        throw forbidden('Branch assignment is required');
      }
    }
  }

  async function resolveHeaderMasters(organizationId, input, authContext) {
    const branch = await locationsService.getBranch(organizationId, input.branchId);
    if (branch.status !== 'active') {
      throw validationFailed('Branch must be active', [
        { field: 'branchId', message: 'branch must be active' },
      ]);
    }
    await assertBranchAccess(authContext, input.branchId);

    const warehouse = await locationsService.getWarehouse(organizationId, input.warehouseId);
    assertActiveWarehouse(warehouse);
    await assertWarehouseAccess(authContext, input.warehouseId);

    let customer = null;
    if (input.customerId) {
      customer = await customersService.getCustomer(organizationId, input.customerId);
      assertActiveCustomer(customer);
    }

    return { branch, warehouse, customer };
  }

  return {
    async listSales(organizationId, query = {}, authContext) {
      const items = await store.listSales(organizationId, {
        status: query.status,
        customerId: query.customerId,
        warehouseId: query.warehouseId,
        branchId: query.branchId,
      });
      const filtered = [];
      for (const item of items) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(item.warehouseId))
        ) {
          continue;
        }
        filtered.push(toSaleDto(item));
      }
      return { items: filtered };
    },

    async getSale(organizationId, saleId, authContext) {
      const record = await store.findSaleById(organizationId, saleId);
      if (record === null) {
        throw notFound('Sale not found');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(record.warehouseId))
      ) {
        throw notFound('Sale not found');
      }
      return toSaleDto(record);
    },

    async createSaleDraft(organizationId, body, authContext) {
      const input = parseSaleDraft(body);
      const { branch, warehouse, customer } = await resolveHeaderMasters(
        organizationId,
        input,
        authContext,
      );
      const lines = await buildResolvedLines({ catalogService }, organizationId, input.lines);

      return transactionRunner.run(async (session) => {
        const created = await store.insertSale(session, {
          organizationId,
          branchId: input.branchId,
          branchNameSnapshot: branch.name,
          warehouseId: input.warehouseId,
          warehouseNameSnapshot: warehouse.name,
          customerId: input.customerId,
          customerNameSnapshot: customer ? customer.name : 'Walk-in',
          saleDate: input.saleDate,
          notes: input.notes,
          lines,
          invoiceNumber: null,
          invoiceSequenceNumber: null,
          status: 'draft',
          postedAt: null,
          postedBy: null,
          createdBy: authContext.userId,
          version: 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'sale.draft.created',
          resourceType: 'sale',
          resourceId: String(created['_id']),
          metadata: {
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            customerId: input.customerId,
            lineCount: lines.length,
          },
        });

        return toSaleDto(created);
      });
    },

    async updateSaleDraft(organizationId, saleId, body, authContext) {
      const existing = await store.findSaleById(organizationId, saleId);
      if (existing === null) {
        throw notFound('Sale not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft sales can be updated');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Sale not found');
      }

      const input = parseSaleDraft(body, { partial: true });
      assertOptimisticVersion(existing, input.expectedVersion);

      const next = {
        branchId: input.branchId ?? String(existing.branchId),
        warehouseId: input.warehouseId ?? String(existing.warehouseId),
        customerId:
          input.customerId !== undefined
            ? input.customerId
            : existing.customerId
              ? String(existing.customerId)
              : null,
        saleDate: input.saleDate ?? String(existing.saleDate),
        notes: input.notes !== undefined ? input.notes : String(existing.notes ?? ''),
      };

      const { branch, warehouse, customer } = await resolveHeaderMasters(
        organizationId,
        next,
        authContext,
      );
      const lineInputs =
        input.lines ??
        existing.lines.map((line) => ({
          productId: String(line.productId),
          packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
          enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
          unitPriceMinorUnits: String(line.unitPriceMinorUnits),
        }));
      const lines = await buildResolvedLines({ catalogService }, organizationId, lineInputs);

      return transactionRunner.run(async (session) => {
        const updated = await store.updateSale(session, organizationId, saleId, {
          ...next,
          branchNameSnapshot: branch.name,
          warehouseNameSnapshot: warehouse.name,
          customerNameSnapshot: customer ? customer.name : 'Walk-in',
          lines,
          version: Number(existing.version) + 1,
          updatedAt: now(),
        });
        if (updated === null) {
          throw conflict('Sale was modified by another request');
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'sale.draft.updated',
          resourceType: 'sale',
          resourceId: saleId,
          metadata: { version: Number(existing.version) + 1 },
        });

        return toSaleDto(updated);
      });
    },

    async discardSaleDraft(organizationId, saleId, authContext) {
      const existing = await store.findSaleById(organizationId, saleId);
      if (existing === null) {
        throw notFound('Sale not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft sales can be discarded');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Sale not found');
      }

      return transactionRunner.run(async (session) => {
        const deleted = await store.deleteSale(session, organizationId, saleId);
        if (!deleted) {
          throw conflict('Only draft sales can be discarded');
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: authContext.userId,
          action: 'sale.draft.discarded',
          resourceType: 'sale',
          resourceId: saleId,
          metadata: {},
        });

        return { discarded: true };
      });
    },

    async allocateInvoiceNumberInSession(session, organizationId, branchId) {
      const branch = await locationsService.getBranch(organizationId, branchId);
      if (branch.status !== 'active') {
        throw validationFailed('Branch must be active', [
          { field: 'branchId', message: 'branch must be active' },
        ]);
      }
      const sequenceNumber = await store.incrementInvoiceSequence(session, organizationId, branchId);
      const invoiceNumber = formatInvoiceNumber(branch.invoicePrefix, sequenceNumber);
      return {
        invoiceNumber,
        invoiceSequenceNumber: sequenceNumber,
        branchInvoicePrefix: branch.invoicePrefix,
      };
    },

    async listUnpaidCustomerSales(organizationId, customerId) {
      const items = await store.listSales(organizationId, { status: 'posted', customerId });
      return items
        .filter((item) => item.invoiceNumber)
        .map((item) => {
          const saleTotal = (item.lines ?? []).reduce(
            (sum, line) => sum + BigInt(line.lineProductAmountMinorUnits ?? '0'),
            0n,
          );
          return {
            id: String(item['_id']),
            invoiceDate: String(item.saleDate),
            dueDate: null,
            sequence: item.invoiceSequenceNumber ?? String(item['_id']),
            outstandingMinorUnits: saleTotal.toString(),
          };
        });
    },
  };
}

function createSalesModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseSalesStore() : createInMemorySalesStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const salesService = createSalesService({
    store,
    catalogService: options.catalogService,
    customersService: options.customersService,
    locationsService: options.locationsService,
    canAccessWarehouse: options.canAccessWarehouse,
    canAccessBranch: options.canAccessBranch,
    transactionRunner,
    persistence,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    store,
    salesService,
    transactionRunner,
  };
}

module.exports = {
  createSalesModule,
  createSalesService,
};
