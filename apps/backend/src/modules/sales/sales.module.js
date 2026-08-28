const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const {
  conflict,
  forbidden,
  insufficientStock,
  notFound,
  validationFailed,
} = require('../../platform/errors/app-error');
const {
  convertEnteredQuantityToBaseMinorUnits,
  parseMoneyMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { hasPermission } = require('../identity/role-permissions');
const { isExpiredOnBusinessDate } = require('../inventory/public');
const {
  createInMemorySalesStore,
  createMongooseSalesStore,
} = require('./sales.store');
const { formatInvoiceNumber } = require('./invoice-sequence');
const {
  parseSaleDraft,
  parseSalePost,
  parseSaleCancel,
  computeLineProductAmount,
  toSaleDto,
  toPrintInvoiceDto,
} = require('./sales.validation');

const SALES_DRAFT_FIELD_CONTROLS = Object.freeze({
  customerId: 'sales.fields.customer',
  notes: 'sales.fields.notes',
});

const SALES_LINE_FIELD_CONTROLS = Object.freeze({
  packagingUnitId: 'sales.fields.packagingUnit',
});

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

async function resolveTierUnitPriceMinor(catalogService, organizationId, productId, priceTier) {
  const { items } = await catalogService.listPrices(organizationId, productId);
  const active = items.filter((item) => item.status === 'active');
  const tier = active.find((item) => item.priceTier === priceTier);
  if (tier) {
    return parseMoneyMinorUnits(tier.price.amount).toString();
  }
  const retail = active.find((item) => item.priceTier === 'retail');
  if (retail) {
    return parseMoneyMinorUnits(retail.price.amount).toString();
  }
  throw validationFailed('No active price for product', [
    { field: 'lines', message: 'product must have an active retail or tier price' },
  ]);
}

function computeSliceEnteredQuantity(totalEnteredMinor, totalBaseMinor, sliceBaseMinor) {
  const totalEntered = BigInt(totalEnteredMinor);
  const totalBase = BigInt(totalBaseMinor);
  const sliceBase = BigInt(sliceBaseMinor);
  if (totalBase <= 0n) {
    return sliceBase.toString();
  }
  return ((totalEntered * sliceBase) / totalBase).toString();
}

function requireApprovalPermission(authContext, permission, message) {
  if (!hasPermission(authContext.permissions ?? [], permission)) {
    throw forbidden(message);
  }
}

function buildApprovalSnapshot(approvalInput, actorId, approvedAt) {
  if (!approvalInput) {
    return null;
  }
  return {
    reason: approvalInput.reason,
    approvedBy: actorId,
    approvedAt,
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

  async function assertActionAllowed(organizationId, action) {
    if (!deps.capabilityService) return;
    await deps.capabilityService.assertAllowed(
      organizationId,
      `sales.actions.${action}`,
      'allowed',
    );
  }

  async function assertDraftFieldEditability(organizationId, body) {
    if (
      !deps.capabilityService ||
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return;
    }
    const controls = new Set();
    if (body.customerId !== undefined && body.customerId !== null && body.customerId !== '') {
      controls.add(SALES_DRAFT_FIELD_CONTROLS.customerId);
    }
    if (typeof body.notes === 'string' && body.notes.trim() !== '') {
      controls.add(SALES_DRAFT_FIELD_CONTROLS.notes);
    }
    if (Array.isArray(body.lines)) {
      for (const line of body.lines) {
        if (line === null || typeof line !== 'object' || Array.isArray(line)) continue;
        if (
          line.packagingUnitId !== undefined &&
          line.packagingUnitId !== null &&
          line.packagingUnitId !== ''
        ) {
          controls.add(SALES_LINE_FIELD_CONTROLS.packagingUnitId);
        }
      }
    }
    for (const controlKey of controls) {
      await deps.capabilityService.assertAllowed(organizationId, controlKey, 'editable');
    }
  }

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

  async function refreshLineSnapshotsForPost(organizationId, lines) {
    const refreshed = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = await catalogService.getProduct(organizationId, String(line.productId));
      assertActiveProduct(product);

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
        unitPriceMinorUnits: String(line.unitPriceMinorUnits),
        lineProductAmountMinorUnits: String(line.lineProductAmountMinorUnits),
      });
    }
    return refreshed;
  }

  async function allocateInvoiceNumberInSession(session, organizationId, branchId) {
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
  }

  return {
    async listSales(organizationId, query = {}, authContext) {
      if (query.warehouseId && typeof deps.canAccessWarehouse === 'function' && !deps.canAccessWarehouse(authContext, query.warehouseId)) {
        return { items: [], total: 0 };
      }
      const assignments = Array.isArray(authContext?.warehouseAssignments) ? authContext.warehouseAssignments : null;
      const warehouseIds = authContext?.role === 'Owner' || assignments === null
        ? undefined
        : assignments.filter((item) => String(item.organizationId) === String(organizationId)).map((item) => String(item.targetId));
      const { items, total } = await store.listSales(organizationId, {
        status: query.status,
        customerId: query.customerId,
        warehouseId: query.warehouseId,
        branchId: query.branchId,
        warehouseIds: query.warehouseId ? undefined : warehouseIds,
        search: query.search,
      }, { skip: query.skip, pageSize: query.pageSize });
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
      return { items: filtered, total };
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

    async getSalePrintInvoice(organizationId, saleId, authContext) {
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
      if (record.status !== 'posted' && record.status !== 'cancelled') {
        throw conflict('Only posted invoices can be printed');
      }
      return toPrintInvoiceDto(record);
    },

    async listPosPaymentAccounts(organizationId) {
      if (!accountsService) {
        return { items: [] };
      }
      const { items } = await accountsService.listAccounts(organizationId);
      return {
        items: items
          .filter((item) => item.status === 'active')
          .map((item) => ({
            id: item.id,
            name: item.name,
            accountType: item.accountType,
          })),
      };
    },

    async createSaleDraft(organizationId, body, authContext) {
      await assertDraftFieldEditability(organizationId, body);
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
      await assertDraftFieldEditability(organizationId, body);
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
      return allocateInvoiceNumberInSession(session, organizationId, branchId);
    },

    async postSale(organizationId, saleId, body, authContext, idempotencyKey) {
      if (!inventoryService || !paymentsService || !accountsService) {
        throw validationFailed('Sale posting dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseSalePost(body);
      if (input.payments.length > 0) {
        await assertActionAllowed(organizationId, 'addPaymentAtPost');
      }
      if (input.approvals.creditLimit) {
        await assertActionAllowed(organizationId, 'approveCreditLimit');
      }
      if (input.approvals.expiredStock) {
        await assertActionAllowed(organizationId, 'approveExpiredStock');
      }
      if (input.approvals.negativeStock) {
        await assertActionAllowed(organizationId, 'overrideNegativeStock');
      }
      const actor = { actorId: String(authContext.userId) };
      const overrideReasonByLine = new Map(
        input.linePriceOverrides.map((entry) => [entry.lineIndex, entry.reason]),
      );

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'sales.post',
        },
        key,
        {
          saleId,
          expectedVersion: input.expectedVersion,
          payments: input.payments,
          linePriceOverrides: input.linePriceOverrides,
          approvals: input.approvals,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findSaleById(organizationId, saleId);
            if (existing === null) {
              throw notFound('Sale not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft sales can be posted');
            }
            assertOptimisticVersion(existing, input.expectedVersion);
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Sale not found');
            }

            const customerId = existing.customerId ? String(existing.customerId) : null;
            let customer = null;
            let priceTier = 'retail';
            if (customerId) {
              customer = await customersService.getCustomer(organizationId, customerId);
              assertActiveCustomer(customer);
              priceTier = customer.priceTier ?? 'retail';
            }

            const branch = await locationsService.getBranch(organizationId, String(existing.branchId));
            if (branch.status !== 'active') {
              throw validationFailed('Branch must be active', [
                { field: 'branchId', message: 'branch must be active' },
              ]);
            }
            await assertBranchAccess(authContext, String(existing.branchId));

            const warehouse = await locationsService.getWarehouse(
              organizationId,
              String(existing.warehouseId),
            );
            assertActiveWarehouse(warehouse);

            let paidTotal = 0n;
            for (const payment of input.payments) {
              paidTotal += BigInt(payment.amountMinorUnits);
            }
            let saleTotalPreview = 0n;
            for (const line of existing.lines) {
              saleTotalPreview += BigInt(String(line.lineProductAmountMinorUnits));
            }
            if (paidTotal > saleTotalPreview) {
              throw validationFailed('Payment total cannot exceed sale total', [
                { field: 'payments', message: 'paid amount cannot exceed sale total' },
              ]);
            }
            const receivablePreview = saleTotalPreview - paidTotal;

            if (receivablePreview > 0n) {
              await assertActionAllowed(organizationId, 'sellOnCredit');
            }

            if (!customerId && receivablePreview > 0n) {
              throw validationFailed('Anonymous walk-in credit is not allowed', [
                { field: 'customerId', message: 'a customer is required for credit sales' },
              ]);
            }

            if (customerId && receivablePreview > 0n) {
              if (customer.creditEnabled !== true) {
                throw validationFailed('Customer credit is not enabled', [
                  { field: 'customerId', message: 'credit is not enabled for this customer' },
                ]);
              }
              if (customer.customerType === 'walk_in') {
                const name = String(customer.name ?? '').trim();
                const phone = String(customer.phone ?? '').trim();
                if (!name || !phone) {
                  throw validationFailed('Anonymous walk-in credit is not allowed', [
                    {
                      field: 'customerId',
                      message: 'walk-in credit requires identifying name and phone',
                    },
                  ]);
                }
              }

              const currentReceivable = await paymentsService.sumCustomerReceivable(
                organizationId,
                customerId,
              );
              const currentReceivableMinor = parseMoneyMinorUnits(currentReceivable.amount);
              const projectedReceivable = currentReceivableMinor + receivablePreview;
              const creditLimitMinor = parseMoneyMinorUnits(customer.creditLimit?.amount ?? '0');
              const exceedsLimit = projectedReceivable > creditLimitMinor;
              const behaviour = String(customer.creditLimitBehaviour ?? 'warning');

              if (exceedsLimit) {
                if (behaviour === 'block') {
                  throw validationFailed('Customer credit limit would be exceeded', [
                    { field: 'payments', message: 'credit limit blocks this sale' },
                  ]);
                }
                if (behaviour === 'manager_approval') {
                  if (!input.approvals.creditLimit) {
                    throw forbidden('Credit-limit override requires Manager or Owner approval');
                  }
                  requireApprovalPermission(
                    authContext,
                    'sales.credit-limit.approve',
                    'Credit-limit approval permission is required',
                  );
                }
              } else if (input.approvals.creditLimit) {
                requireApprovalPermission(
                  authContext,
                  'sales.credit-limit.approve',
                  'Credit-limit approval permission is required',
                );
              }
            }

            const invoiceAllocation = await allocateInvoiceNumberInSession(
              session,
              organizationId,
              String(existing.branchId),
            );

            const lines = await refreshLineSnapshotsForPost(organizationId, existing.lines);
            const postedLines = [];
            let saleTotal = 0n;
            let saleCogsTotal = 0n;
            let usedExpiredStock = false;
            let usedNegativeStockOverride = false;
            let allocationBusinessDate = null;

            const negativeStockRequested = Boolean(input.approvals.negativeStock);
            if (negativeStockRequested) {
              requireApprovalPermission(
                authContext,
                'inventory.negative-stock.override',
                'Negative-stock override permission is required',
              );
            }

            for (let index = 0; index < lines.length; index += 1) {
              const line = lines[index];
              const catalogPriceMinorUnits = await resolveTierUnitPriceMinor(
                catalogService,
                organizationId,
                line.productId,
                priceTier,
              );
              const unitPrice = BigInt(line.unitPriceMinorUnits);
              const catalogPrice = BigInt(catalogPriceMinorUnits);
              let priceOverrideReason = null;

              if (unitPrice !== catalogPrice) {
                await assertActionAllowed(organizationId, 'overridePrice');
                if (!hasPermission(authContext.permissions ?? [], 'pricing.override')) {
                  throw forbidden('Price override permission is required');
                }
                const reason = overrideReasonByLine.get(index);
                if (!reason) {
                  throw validationFailed('Price override reason is required', [
                    {
                      field: `linePriceOverrides[${index}].reason`,
                      message: 'reason is required when unit price differs from tier price',
                    },
                  ]);
                }
                priceOverrideReason = reason;
                await auditWriter.appendBusinessEvent(session, {
                  organizationId,
                  actorId: actor.actorId,
                  action: 'sale.price.overridden',
                  resourceType: 'sale',
                  resourceId: saleId,
                  metadata: {
                    lineIndex: index,
                    productId: line.productId,
                    catalogPriceMinorUnits: catalogPrice.toString(),
                    unitPriceMinorUnits: unitPrice.toString(),
                    reason,
                  },
                });
              }

              let allocation = await inventoryService.allocateStockForProduct(organizationId, {
                warehouseId: String(existing.warehouseId),
                productId: line.productId,
                quantityBaseMinorUnits: line.quantityBaseMinorUnits,
                excludeExpired: true,
                allowPartial: true,
              });
              allocationBusinessDate = allocation.businessDate;

              if (!allocation.ok) {
                const withExpired = await inventoryService.allocateStockForProduct(organizationId, {
                  warehouseId: String(existing.warehouseId),
                  productId: line.productId,
                  quantityBaseMinorUnits: line.quantityBaseMinorUnits,
                  excludeExpired: false,
                  allowPartial: true,
                });
                allocationBusinessDate = withExpired.businessDate;

                const expiredSlices = withExpired.allocations.filter((slice) =>
                  isExpiredOnBusinessDate(slice.expiryDate, withExpired.businessDate),
                );
                const coveredAny = withExpired.allocations.length > 0;
                const fullyCovered = withExpired.ok === true;

                if (fullyCovered || coveredAny) {
                  if (expiredSlices.length > 0) {
                    if (!input.approvals.expiredStock) {
                      throw forbidden('Expired-stock sale requires Manager or Owner approval');
                    }
                    requireApprovalPermission(
                      authContext,
                      'sales.expired-stock.approve',
                      'Expired-stock approval permission is required',
                    );
                    usedExpiredStock = true;
                  }
                  allocation = withExpired;
                }

                if (!allocation.ok && !negativeStockRequested) {
                  throw insufficientStock();
                }
                if (!allocation.ok && negativeStockRequested) {
                  allocation = withExpired.allocations.length >= allocation.allocations.length
                    ? withExpired
                    : allocation;
                }
              }

              const stockAllocations = [];
              let lineCogsTotal = 0n;
              const slices = [...allocation.allocations];

              if (!allocation.ok) {
                const remainingBase = BigInt(allocation.remainingQuantityBaseMinorUnits);
                if (remainingBase > 0n) {
                  usedNegativeStockOverride = true;
                  let overrideBatchId = null;
                  let overrideBatchNumber = null;
                  let overrideExpiryDate = null;
                  if (slices.length > 0) {
                    const last = slices[slices.length - 1];
                    overrideBatchId = last.batchId;
                    overrideBatchNumber = last.batchNumber ?? null;
                    overrideExpiryDate = last.expiryDate ?? null;
                  } else if (allocation.trackingMode !== 'none') {
                    const batches = await inventoryService.listBatches(organizationId, {
                      productId: line.productId,
                    });
                    const firstBatch = batches.items[0];
                    if (!firstBatch) {
                      throw validationFailed(
                        'Negative-stock override requires an existing batch for tracked products',
                        [{ field: 'lines', message: 'no batch available for negative-stock sale' }],
                      );
                    }
                    overrideBatchId = firstBatch.id;
                    overrideBatchNumber = firstBatch.batchNumber ?? null;
                    overrideExpiryDate = firstBatch.expiryDate ?? null;
                  }
                  slices.push({
                    batchId: overrideBatchId,
                    batchNumber: overrideBatchNumber,
                    expiryDate: overrideExpiryDate,
                    quantityBaseMinorUnits: remainingBase.toString(),
                    quantityBase: null,
                    negativeOverride: true,
                  });
                }
              }

              for (const slice of slices) {
                const sliceBaseMinor = String(
                  slice.quantityBaseMinorUnits ??
                    parseQuantityMinorUnits(slice.quantityBase).toString(),
                );
                const sliceEnteredMinor = computeSliceEnteredQuantity(
                  line.enteredQuantityMinorUnits,
                  line.quantityBaseMinorUnits,
                  sliceBaseMinor,
                );
                const isOverrideSlice = slice.negativeOverride === true;

                const outbound = await inventoryService.postOutboundIssueInSession(
                  session,
                  organizationId,
                  actor,
                  {
                    warehouseId: String(existing.warehouseId),
                    productId: line.productId,
                    batchId: slice.batchId,
                    quantityBaseMinorUnits: sliceBaseMinor,
                    enteredQuantityMinorUnits: sliceEnteredMinor,
                    unitCode: line.unitCodeSnapshot,
                    conversionFactorSnapshot: line.conversionFactorSnapshot,
                    packagingUnitId: line.packagingUnitId,
                    sourceType: 'sale',
                    sourceId: saleId,
                    postedAt: now(),
                    allowNegativeStockOverride: isOverrideSlice,
                    negativeStockOverrideReason: isOverrideSlice
                      ? input.approvals.negativeStock.reason
                      : null,
                    negativeStockOverrideBy: isOverrideSlice ? actor.actorId : null,
                    reason: isOverrideSlice ? input.approvals.negativeStock.reason : null,
                  },
                );

                const cogsMinorUnits = String(outbound.movement.inventoryValueMinorUnits);
                lineCogsTotal += BigInt(cogsMinorUnits);
                stockAllocations.push({
                  batchId: slice.batchId,
                  batchNumber: slice.batchNumber ?? null,
                  expiryDate: slice.expiryDate ?? null,
                  quantityBaseMinorUnits: sliceBaseMinor,
                  cogsMinorUnits,
                });
              }

              saleCogsTotal += lineCogsTotal;
              saleTotal += BigInt(line.lineProductAmountMinorUnits);

              postedLines.push({
                ...line,
                priceTierSnapshot: priceTier,
                catalogPriceMinorUnits,
                priceOverrideReason,
                cogsTotalMinorUnits: lineCogsTotal.toString(),
                stockAllocations,
              });
            }

            const receivableTotal = saleTotal - paidTotal;

            if (
              customerId &&
              receivableTotal > 0n &&
              String(customer.creditLimitBehaviour ?? 'warning') === 'warning'
            ) {
              const currentReceivable = await paymentsService.sumCustomerReceivable(
                organizationId,
                customerId,
              );
              const currentReceivableMinor = parseMoneyMinorUnits(currentReceivable.amount);
              const projectedReceivable = currentReceivableMinor + receivableTotal;
              const creditLimitMinor = parseMoneyMinorUnits(customer.creditLimit?.amount ?? '0');
              if (projectedReceivable > creditLimitMinor) {
                await auditWriter.appendBusinessEvent(session, {
                  organizationId,
                  actorId: actor.actorId,
                  action: 'sale.credit_limit.warning',
                  resourceType: 'sale',
                  resourceId: saleId,
                  metadata: {
                    customerId,
                    creditLimitMinorUnits: creditLimitMinor.toString(),
                    projectedReceivableMinorUnits: projectedReceivable.toString(),
                  },
                });
              }
            }

            if (usedExpiredStock) {
              requireApprovalPermission(
                authContext,
                'sales.expired-stock.approve',
                'Expired-stock approval permission is required',
              );
              if (!input.approvals.expiredStock) {
                throw forbidden('Expired-stock sale requires Manager or Owner approval');
              }
            } else if (input.approvals.expiredStock) {
              requireApprovalPermission(
                authContext,
                'sales.expired-stock.approve',
                'Expired-stock approval permission is required',
              );
            }

            if (usedNegativeStockOverride) {
              requireApprovalPermission(
                authContext,
                'inventory.negative-stock.override',
                'Negative-stock override permission is required',
              );
              if (!input.approvals.negativeStock) {
                throw forbidden('Negative-stock override requires Owner approval');
              }
            }

            const postedAt = now();
            const creditLimitApproval =
              input.approvals.creditLimit && receivableTotal > 0n
                ? buildApprovalSnapshot(input.approvals.creditLimit, actor.actorId, postedAt)
                : null;
            const expiredStockApproval = usedExpiredStock
              ? buildApprovalSnapshot(input.approvals.expiredStock, actor.actorId, postedAt)
              : null;
            const negativeStockOverride = usedNegativeStockOverride
              ? buildApprovalSnapshot(input.approvals.negativeStock, actor.actorId, postedAt)
              : null;

            if (creditLimitApproval) {
              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'sale.credit_limit.approved',
                resourceType: 'sale',
                resourceId: saleId,
                metadata: {
                  reason: creditLimitApproval.reason,
                  customerId,
                  receivableTotalMinorUnits: receivableTotal.toString(),
                },
              });
            }
            if (expiredStockApproval) {
              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'sale.expired_stock.approved',
                resourceType: 'sale',
                resourceId: saleId,
                metadata: {
                  reason: expiredStockApproval.reason,
                  businessDate: allocationBusinessDate,
                },
              });
            }
            if (negativeStockOverride) {
              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'sale.negative_stock.overridden',
                resourceType: 'sale',
                resourceId: saleId,
                metadata: {
                  reason: negativeStockOverride.reason,
                },
              });
            }

            const paymentSnapshots = [];

            if (customerId && saleTotal > 0n) {
              await paymentsService.postCustomerReceivableEffect(session, {
                organizationId,
                customerId,
                signedAmountMinorUnits: saleTotal.toString(),
                sourceType: 'sale_receivable',
                sourceId: saleId,
                postedAt,
                postedBy: actor.actorId,
              });
            }

            for (let paymentIndex = 0; paymentIndex < input.payments.length; paymentIndex += 1) {
              const payment = input.payments[paymentIndex];
              const account = await accountsService.getAccount(organizationId, payment.accountId);
              if (account.status !== 'active') {
                throw validationFailed('Account must be active', [
                  { field: 'payments', message: 'account must be active' },
                ]);
              }

              if (customerId) {
                const paymentResult = await paymentsService.postCustomerPaymentInSession(session, {
                  organizationId,
                  customerId,
                  accountId: payment.accountId,
                  allocationMode: 'invoice_specific',
                  amountMinorUnits: payment.amountMinorUnits,
                  paymentDate: String(existing.saleDate),
                  notes: '',
                  saleAllocations: [
                    {
                      saleId,
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
                  signedAmountMinorUnits: payment.amountMinorUnits,
                  sourceType: 'customer_payment',
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
                  accountMovementSourceId: paymentResult.payment['_id'],
                });
              } else {
                const mongoose = require('mongoose');
                const movementSourceId = new mongoose.Types.ObjectId();
                await accountsService.postAccountMovement(session, {
                  organizationId,
                  accountId: payment.accountId,
                  signedAmountMinorUnits: payment.amountMinorUnits,
                  sourceType: 'customer_payment',
                  sourceId: String(movementSourceId),
                  postedAt,
                  postedBy: actor.actorId,
                });

                paymentSnapshots.push({
                  accountId: payment.accountId,
                  accountNameSnapshot: account.name,
                  accountTypeSnapshot: account.accountType,
                  amountMinorUnits: payment.amountMinorUnits,
                  paymentId: null,
                  accountMovementSourceId: movementSourceId,
                });
              }
            }

            const updated = await store.updateSaleIfDraft(
              session,
              organizationId,
              saleId,
              input.expectedVersion,
              {
                customerNameSnapshot: customer ? customer.name : 'Walk-in',
                branchNameSnapshot: branch.name,
                warehouseNameSnapshot: warehouse.name,
                priceTierSnapshot: priceTier,
                lines: postedLines,
                saleTotalMinorUnits: saleTotal.toString(),
                paidTotalMinorUnits: paidTotal.toString(),
                receivableTotalMinorUnits: receivableTotal.toString(),
                cogsTotalMinorUnits: saleCogsTotal.toString(),
                paymentSnapshots,
                creditLimitApproval,
                expiredStockApproval,
                negativeStockOverride,
                invoiceNumber: invoiceAllocation.invoiceNumber,
                invoiceSequenceNumber: invoiceAllocation.invoiceSequenceNumber,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                updatedAt: postedAt,
              },
            );
            if (updated === null) {
              throw conflict('Sale was already posted or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'sale.posted',
              resourceType: 'sale',
              resourceId: saleId,
              metadata: {
                invoiceNumber: invoiceAllocation.invoiceNumber,
                saleTotalMinorUnits: saleTotal.toString(),
                paidTotalMinorUnits: paidTotal.toString(),
                receivableTotalMinorUnits: receivableTotal.toString(),
                lineCount: postedLines.length,
              },
            });

            return toSaleDto(updated);
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

    async cancelSale(organizationId, saleId, body, authContext, idempotencyKey) {
      if (!inventoryService || !paymentsService || !accountsService) {
        throw validationFailed('Sale cancellation dependencies are not configured');
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseSaleCancel(body);
      const actor = { actorId: String(authContext.userId) };

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'sales.cancel',
        },
        key,
        {
          saleId,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findSaleById(organizationId, saleId);
            if (existing === null) {
              throw notFound('Sale not found');
            }
            if (existing.status !== 'posted') {
              throw conflict('Only posted sales can be cancelled');
            }
            if (Number(existing.version) !== Number(input.expectedVersion)) {
              throw conflict('Sale was modified by another request');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Sale not found');
            }

            const cancelledAt = now();
            const saleTotal = BigInt(String(existing.saleTotalMinorUnits ?? '0'));
            const customerId = existing.customerId ? String(existing.customerId) : null;

            for (const line of existing.lines) {
              for (const allocation of line.stockAllocations ?? []) {
                const qtyBase = String(allocation.quantityBaseMinorUnits);
                const entered = computeSliceEnteredQuantity(
                  String(line.enteredQuantityMinorUnits),
                  String(line.quantityBaseMinorUnits),
                  qtyBase,
                );
                await inventoryService.postInboundReceiptInSession(session, organizationId, actor, {
                  warehouseId: String(existing.warehouseId),
                  productId: String(line.productId),
                  batchId: allocation.batchId ? String(allocation.batchId) : null,
                  batchNumber: allocation.batchNumber ?? null,
                  expiryDate: allocation.expiryDate ?? null,
                  quantityBaseMinorUnits: qtyBase,
                  enteredQuantityMinorUnits: entered,
                  unitCode: String(line.unitCodeSnapshot),
                  conversionFactorSnapshot: String(line.conversionFactorSnapshot),
                  packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
                  inventoryValueMinorUnits: String(allocation.cogsMinorUnits ?? '0'),
                  sourceType: 'sale_cancellation',
                  sourceId: saleId,
                  reason: input.reason,
                  postedAt: cancelledAt,
                });
              }
            }

            if (customerId && saleTotal > 0n) {
              await paymentsService.postCustomerReceivableEffect(session, {
                organizationId,
                customerId,
                signedAmountMinorUnits: `-${saleTotal.toString()}`,
                sourceType: 'sale_cancellation',
                sourceId: saleId,
                postedAt: cancelledAt,
                postedBy: actor.actorId,
              });
            }

            const priorAllocations = customerId
              ? await paymentsService.listSaleAllocations(organizationId, saleId)
              : [];

            for (const allocation of priorAllocations) {
              await paymentsService.postCustomerReceivableEffect(session, {
                organizationId,
                customerId,
                signedAmountMinorUnits: allocation.allocatedAmountMinorUnits,
                sourceType: 'sale_cancellation_allocation_reversal',
                sourceId: String(allocation['_id']),
                postedAt: cancelledAt,
                postedBy: actor.actorId,
              });

              const payment = await paymentsService.getCustomerPaymentRaw(
                organizationId,
                String(allocation.paymentId),
              );
              if (payment) {
                await accountsService.postAccountMovement(session, {
                  organizationId,
                  accountId: String(payment.accountId),
                  signedAmountMinorUnits: `-${String(allocation.allocatedAmountMinorUnits)}`,
                  sourceType: 'sale_cancellation_refund',
                  sourceId: String(allocation['_id']),
                  postedAt: cancelledAt,
                  postedBy: actor.actorId,
                });
              }
            }

            if (!customerId) {
              for (const snapshot of existing.paymentSnapshots ?? []) {
                const mongoose = require('mongoose');
                const refundSourceId =
                  snapshot.accountMovementSourceId ?? new mongoose.Types.ObjectId();
                await accountsService.postAccountMovement(session, {
                  organizationId,
                  accountId: String(snapshot.accountId),
                  signedAmountMinorUnits: `-${String(snapshot.amountMinorUnits)}`,
                  sourceType: 'sale_cancellation_refund',
                  sourceId: String(refundSourceId),
                  postedAt: cancelledAt,
                  postedBy: actor.actorId,
                });
              }
            }

            const updated = await store.updateSaleIfPosted(
              session,
              organizationId,
              saleId,
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
              throw conflict('Sale was already cancelled or modified concurrently');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'sale.cancelled',
              resourceType: 'sale',
              resourceId: saleId,
              metadata: {
                reason: input.reason,
                saleTotalMinorUnits: saleTotal.toString(),
                priorAllocationsCount: priorAllocations.length,
                invoiceNumber: existing.invoiceNumber ?? null,
              },
            });

            return toSaleDto(updated);
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

    async getSaleSourceForReturn(organizationId, saleId) {
      const record = await store.findSaleById(organizationId, saleId);
      if (record === null) {
        throw notFound('Sale not found');
      }
      if (record.status !== 'posted') {
        throw conflict('Sale must be posted to be used as a return source');
      }
      return {
        id: String(record['_id']),
        status: String(record['status']),
        warehouseId: String(record['warehouseId']),
        customerId: record['customerId'] ? String(record['customerId']) : null,
        customerNameSnapshot: record['customerNameSnapshot'] ?? null,
        invoiceNumber: record['invoiceNumber'] ?? null,
        saleDate: String(record['saleDate']),
        saleTotalMinorUnits: String(record['saleTotalMinorUnits'] ?? '0'),
        currency: 'PKR',
        lines: (record.lines ?? []).map((line) => ({
          productId: String(line.productId),
          productNameSnapshot: String(line.productNameSnapshot),
          trackingModeSnapshot: line.trackingModeSnapshot
            ? String(line.trackingModeSnapshot)
            : null,
          packagingUnitId: line.packagingUnitId ? String(line.packagingUnitId) : null,
          unitCodeSnapshot: String(line.unitCodeSnapshot),
          conversionFactorSnapshot: String(line.conversionFactorSnapshot),
          quantityBaseMinorUnits: String(line.quantityBaseMinorUnits),
          enteredQuantityMinorUnits: String(line.enteredQuantityMinorUnits),
          unitPriceMinorUnits: String(line.unitPriceMinorUnits),
          lineProductAmountMinorUnits: String(line.lineProductAmountMinorUnits),
          cogsTotalMinorUnits: String(line.cogsTotalMinorUnits ?? '0'),
          stockAllocations: (line.stockAllocations ?? []).map((allocation) => ({
            batchId: allocation.batchId ? String(allocation.batchId) : null,
            batchNumber: allocation.batchNumber ?? null,
            expiryDate: allocation.expiryDate ?? null,
            quantityBaseMinorUnits: String(allocation.quantityBaseMinorUnits),
            cogsMinorUnits: String(allocation.cogsMinorUnits ?? '0'),
          })),
        })),
      };
    },

    async listUnpaidCustomerSales(organizationId, customerId) {
      const { items } = await store.listSales(organizationId, { status: 'posted', customerId });
      const result = [];
      for (const item of items) {
        if (!item.saleTotalMinorUnits) {
          continue;
        }
        const saleTotal = BigInt(String(item.saleTotalMinorUnits));
        const allocations =
          paymentsService && typeof paymentsService.listSaleAllocations === 'function'
            ? await paymentsService.listSaleAllocations(organizationId, String(item['_id']))
            : [];
        const allocated = allocations.reduce(
          (sum, allocation) => sum + BigInt(allocation.allocatedAmountMinorUnits),
          0n,
        );
        const outstanding = saleTotal - allocated;
        if (outstanding <= 0n) {
          continue;
        }
        result.push({
          id: String(item['_id']),
          invoiceDate: String(item.saleDate),
          dueDate: null,
          sequence: item.invoiceSequenceNumber ?? String(item['_id']),
          outstandingMinorUnits: outstanding.toString(),
        });
      }
      return result;
    },

    /**
     * Read helper for Alerts dead-stock: product IDs with posted (non-cancelled) sale lines
     * on saleDate within [fromSaleDate, toSaleDate] inclusive.
     */
    async listPostedSaleProductActivity(organizationId, query = {}, authContext) {
      const fromSaleDate =
        typeof query.fromSaleDate === 'string' && query.fromSaleDate.trim() !== ''
          ? query.fromSaleDate.trim()
          : null;
      const toSaleDate =
        typeof query.toSaleDate === 'string' && query.toSaleDate.trim() !== ''
          ? query.toSaleDate.trim()
          : null;
      const { items } = await store.listSales(organizationId, { status: 'posted' });
      const productIds = new Set();
      for (const item of items) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(item.warehouseId))
        ) {
          continue;
        }
        const saleDate = String(item.saleDate);
        if (fromSaleDate !== null && saleDate < fromSaleDate) {
          continue;
        }
        if (toSaleDate !== null && saleDate > toSaleDate) {
          continue;
        }
        for (const line of item.lines ?? []) {
          if (line.productId) {
            productIds.add(String(line.productId));
          }
        }
      }
      return { productIds: [...productIds] };
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
    inventoryService: options.inventoryService,
    paymentsService: options.paymentsService,
    accountsService: options.accountsService,
    capabilityService: options.capabilityService,
    canAccessWarehouse: options.canAccessWarehouse,
    canAccessBranch: options.canAccessBranch,
    transactionRunner,
    persistence,
    ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
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
