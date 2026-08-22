const mongoose = require('mongoose');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  conflict,
  forbidden,
  insufficientStock,
  notFound,
  validationFailed,
  versionConflict,
} = require('../../platform/errors/app-error');
const {
  convertEnteredQuantityToBaseMinorUnits,
  formatQuantityMinorUnits,
  computeUnitCostMinorUnits,
} = require('../../platform/primitives/money-and-time');
const { allocateStock } = require('./allocation');
const {
  DEFAULT_EXPIRY_THRESHOLD_DAYS,
  classifyExpiry,
  resolveBusinessDate,
} = require('./expiry');
const {
  applyBalanceInbound,
  applyBalanceUnsellableInbound,
  applyBalanceOutbound,
  applyBalanceUnsellableOutbound,
  applyCostInbound,
  applyCostOutbound,
  applyCostOutboundAtValue,
} = require('./inventory-posting');
const {
  parseAdjustmentDraft,
  parseAdjustmentPostOptions,
  parseOpeningStock,
  parseTransferDraft,
  parseTransferPostOptions,
  toAdjustmentDto,
  toBatchDto,
  toBalanceDto,
  toCostStateDto,
  toExpiryItemDto,
  toMovementDto,
  toOpeningStockResultDto,
  toReconciliationDto,
  toTransferDto,
} = require('./inventory.validation');
const { ADJUSTMENT_DIRECTIONS } = require('./persistence/stock-adjustment.model');
const { reconcileInventoryState } = require('./reconciliation');

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
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

function assertTrackingInputs(product, input) {
  const mode = product.trackingMode;
  if (mode === 'none') {
    if (input.batchNumber !== null) {
      throw validationFailed('batchNumber is not allowed for products without batch tracking', [
        { field: 'batchNumber', message: 'batchNumber is not allowed for trackingMode none' },
      ]);
    }
    if (input.expiryDate !== null) {
      throw validationFailed('expiryDate is not allowed for products without batch tracking', [
        { field: 'expiryDate', message: 'expiryDate is not allowed for trackingMode none' },
      ]);
    }
    if (input.manufacturingDate !== null) {
      throw validationFailed(
        'manufacturingDate is not allowed for products without batch tracking',
        [{ field: 'manufacturingDate', message: 'manufacturingDate is not allowed for trackingMode none' }],
      );
    }
    return;
  }

  if (input.batchNumber === null) {
    throw validationFailed('batchNumber is required for batch-tracked products', [
      { field: 'batchNumber', message: 'batchNumber is required' },
    ]);
  }

  if (mode === 'batch_expiry' && input.expiryDate === null) {
    throw validationFailed('expiryDate is required for batch_expiry tracking', [
      { field: 'expiryDate', message: 'expiryDate is required' },
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

function adjustmentDirectionForType(adjustmentType, explicitDirection) {
  if (adjustmentType === 'correction') {
    if (!ADJUSTMENT_DIRECTIONS.includes(explicitDirection)) {
      throw validationFailed('direction is required for correction adjustments', [
        { field: 'direction', message: 'direction must be inbound or outbound' },
      ]);
    }
    return explicitDirection;
  }
  if (adjustmentType === 'damage' || adjustmentType === 'expiry' || adjustmentType === 'loss') {
    return 'outbound';
  }
  throw validationFailed('Invalid adjustment type', [
    { field: 'adjustmentType', message: 'invalid adjustment type' },
  ]);
}

function createInventoryService(deps) {
  const store = deps.store;
  const catalogService = deps.catalogService;
  const locationsService = deps.locationsService;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());

  function accessibleWarehouseIds(organizationId, authContext) {
    if (authContext?.role === 'Owner' || !Array.isArray(authContext?.warehouseAssignments)) return undefined;
    return authContext.warehouseAssignments
      .filter((item) => String(item.organizationId) === String(organizationId))
      .map((item) => String(item.targetId));
  }
  const createObjectId = deps.createObjectId ?? (() => new mongoose.Types.ObjectId());
  const resolveOrganizationTimezone =
    deps.resolveOrganizationTimezone ??
    (async () => {
      return 'Asia/Karachi';
    });
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function resolveOrCreateBatch(session, organizationId, product, input, postedAt) {
    if (product.trackingMode === 'none') {
      return null;
    }

    const existing = await store.findBatchByNumber(
      organizationId,
      product.id,
      input.batchNumber,
    );
    if (existing !== null) {
      if (
        product.trackingMode === 'batch_expiry' &&
        String(existing.expiryDate ?? '') !== String(input.expiryDate ?? '')
      ) {
        throw conflict('Existing batch expiry does not match');
      }
      return existing;
    }

    try {
      return await store.insertBatch(session, {
        organizationId,
        productId: product.id,
        batchNumber: input.batchNumber,
        manufacturingDate: input.manufacturingDate ?? null,
        expiryDate: product.trackingMode === 'batch_expiry' ? input.expiryDate : input.expiryDate,
        firstReceivedAt: postedAt,
      });
    } catch (error) {
      mapDuplicate(error, 'Batch identity already exists for this product');
    }
  }

  async function resolveBatchForAdjustment(session, organizationId, product, batchId, batchNumber) {
    if (product.trackingMode === 'none') {
      if (batchId !== null || batchNumber !== null) {
        throw validationFailed('batch is not allowed for products without batch tracking', [
          { field: 'batchId', message: 'batch is not allowed for trackingMode none' },
        ]);
      }
      return null;
    }

    if (batchId !== null) {
      const batch = await store.findBatchById(organizationId, batchId);
      if (batch === null || String(batch.productId) !== String(product.id)) {
        throw notFound('Batch not found');
      }
      return batch;
    }

    if (batchNumber === null) {
      throw validationFailed('batchId or batchNumber is required for batch-tracked products', [
        { field: 'batchId', message: 'batch is required' },
      ]);
    }

    return resolveOrCreateBatch(
      session,
      organizationId,
      product,
      { batchNumber, manufacturingDate: null, expiryDate: null },
      now(),
    );
  }

  async function resolveExpiryThresholdDays(organizationId) {
    const settings = await store.findInventorySettings(organizationId);
    if (settings === null) {
      return DEFAULT_EXPIRY_THRESHOLD_DAYS;
    }
    return Number(settings.expiryThresholdDays ?? DEFAULT_EXPIRY_THRESHOLD_DAYS);
  }

  async function resolveBusinessDateForOrganization(organizationId) {
    const timezone = await resolveOrganizationTimezone(organizationId);
    return resolveBusinessDate(timezone, now());
  }

  function assertNegativeStockOverride(authContext, options) {
    if (!options.negativeStockOverride) {
      return { allowNegativeStockOverride: false, reason: null, actorId: null };
    }
    if (!deps.hasPermission(authContext, 'inventory.negative-stock.override')) {
      throw forbidden('Negative-stock override permission is required');
    }
    if (typeof options.negativeStockOverrideReason !== 'string' || options.negativeStockOverrideReason.trim() === '') {
      throw validationFailed('Negative-stock override requires a reason', [
        { field: 'negativeStockOverrideReason', message: 'reason is required for negative-stock override' },
      ]);
    }
    return {
      allowNegativeStockOverride: true,
      reason: options.negativeStockOverrideReason.trim(),
      actorId: String(authContext.userId),
    };
  }

  async function postStockMovementEffects(session, organizationId, actor, payload) {
    const scope = {
      warehouseId: payload.warehouseId,
      productId: payload.productId,
      batchId: payload.batchId,
    };
    const quantity = payload.quantityBaseMinorUnits;

    let balance;
    let costResult;
    let movementInventoryValue;
    let movementUnitCost;

    const stockCondition = payload.stockCondition === 'unsellable' ? 'unsellable' : 'sellable';

    if (payload.direction === 'inbound' && stockCondition === 'unsellable') {
      costResult = {
        costState: await store.findCostState(organizationId, scope.warehouseId, scope.productId),
        receiptUnitCostMinorUnits: computeUnitCostMinorUnits(
          payload.inventoryValueMinorUnits,
          quantity,
        ),
      };
      balance = await applyBalanceUnsellableInbound(
        store,
        session,
        organizationId,
        scope,
        quantity,
      );
      movementUnitCost = costResult.receiptUnitCostMinorUnits.toString();
      movementInventoryValue = payload.inventoryValueMinorUnits.toString();
    } else if (payload.direction === 'outbound' && stockCondition === 'unsellable') {
      const unsellableValue = BigInt(String(payload.inventoryValueMinorUnits ?? '0'));
      costResult = {
        costState: await store.findCostState(organizationId, scope.warehouseId, scope.productId),
        receiptUnitCostMinorUnits: computeUnitCostMinorUnits(unsellableValue, quantity),
      };
      balance = await applyBalanceUnsellableOutbound(
        store,
        session,
        organizationId,
        scope,
        quantity,
      );
      movementUnitCost = costResult.receiptUnitCostMinorUnits.toString();
      movementInventoryValue = unsellableValue.toString();
    } else if (payload.direction === 'inbound') {
      costResult = await applyCostInbound(store, session, organizationId, scope, {
        quantityBaseMinorUnits: quantity,
        inventoryValueMinorUnits: payload.inventoryValueMinorUnits,
      });
      balance = await applyBalanceInbound(store, session, organizationId, scope, quantity);
      movementUnitCost = costResult.receiptUnitCostMinorUnits.toString();
      movementInventoryValue = payload.inventoryValueMinorUnits.toString();
    } else {
      // Enforce availability before mutating cost so insufficient-stock failures
      // cannot leave a one-sided cost-state change outside a true rollback.
      balance = await applyBalanceOutbound(store, session, organizationId, scope, quantity, {
        allowNegativeStockOverride: payload.allowNegativeStockOverride,
      });
      if (
        payload.inventoryValueMinorUnits !== undefined &&
        payload.inventoryValueMinorUnits !== null &&
        payload.useExplicitOutboundValue === true
      ) {
        costResult = await applyCostOutboundAtValue(
          store,
          session,
          organizationId,
          scope,
          quantity,
          BigInt(String(payload.inventoryValueMinorUnits)),
        );
      } else {
        costResult = await applyCostOutbound(store, session, organizationId, scope, quantity);
      }
      movementInventoryValue = costResult.outboundValueMinorUnits.toString();
      movementUnitCost = costResult.unitCostMinorUnits.toString();
    }

    const movementId = payload.movementId ?? createObjectId();
    let movement;
    try {
      movement = await store.insertMovement(session, {
        _id: movementId,
        organizationId,
        warehouseId: payload.warehouseId,
        productId: payload.productId,
        batchId: payload.batchId,
        direction: payload.direction,
        quantityBaseMinorUnits: quantity.toString(),
        enteredQuantityMinorUnits: payload.enteredQuantityMinorUnits,
        unitCode: payload.unitCode,
        conversionFactorSnapshot: payload.conversionFactorSnapshot,
        packagingUnitId: payload.packagingUnitId,
        inventoryValueMinorUnits: movementInventoryValue,
        unitCostMinorUnits: movementUnitCost,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
        stockCondition,
        status: 'posted',
        postedAt: payload.postedAt,
        postedBy: actor.actorId,
        correctionOfId: payload.correctionOfId ?? null,
        reversalOfId: payload.reversalOfId ?? null,
        reason: payload.reason ?? null,
        negativeStockOverride: payload.allowNegativeStockOverride === true,
        negativeStockOverrideReason: payload.negativeStockOverrideReason ?? null,
        negativeStockOverrideBy: payload.negativeStockOverrideBy ?? null,
      });
    } catch (error) {
      mapDuplicate(error, 'Stock movement already exists');
    }

    return { movement, balance, costState: costResult.costState };
  }

  return {
    async listBatches(organizationId, query) {
      const filters = {};
      if (typeof query?.productId === 'string' && query.productId.trim() !== '') {
        filters.productId = query.productId.trim();
      }
      if (typeof query?.warehouseId === 'string' && query.warehouseId.trim() !== '') {
        const whBalances = await store.listBalances(organizationId, { warehouseId: query.warehouseId.trim() });
        const distinctBatchIds = [
          ...new Set(
            whBalances
              .filter((b) => b.batchId)
              .map((b) => String(b.batchId)),
          ),
        ];
        filters.batchIds = distinctBatchIds;
      }
      if (typeof query?.search === 'string' && query.search.trim() !== '') {
        filters.search = query.search.trim();
        if (catalogService && typeof catalogService.listProducts === 'function') {
          try {
            const { items: matchedProducts } = await catalogService.listProducts(organizationId, {
              search: filters.search,
              limit: 50,
            });
            if (matchedProducts && matchedProducts.length > 0) {
              filters.productIds = matchedProducts.map((p) => String(p.id ?? p._id));
            }
          } catch {
            // ignore catalog search failure, fallback to search on batchNumber
          }
        }
      }
      if (query?.skip !== undefined || query?.pageSize !== undefined) {
        const { items, total } = await store.listBatchesPage(organizationId, filters, query);
        return { items: items.map(toBatchDto), total };
      }
      const items = await store.listBatches(organizationId, filters);
      return { items: items.map(toBatchDto), total: items.length };
    },

    async getBatch(organizationId, batchId) {
      const record = await store.findBatchById(organizationId, batchId);
      if (record === null) {
        throw notFound('Batch not found');
      }
      return toBatchDto(record);
    },

    async listBalances(organizationId, query, authContext) {
      const filters = {};
      if (typeof query?.warehouseId === 'string' && query.warehouseId.trim() !== '') {
        filters.warehouseId = query.warehouseId.trim();
      }
      if (typeof query?.productId === 'string' && query.productId.trim() !== '') {
        filters.productId = query.productId.trim();
      }
      if (typeof query?.batchId === 'string' && query.batchId.trim() !== '') {
        filters.batchId = query.batchId.trim();
      }
      if (!filters.warehouseId) filters.warehouseIds = accessibleWarehouseIds(organizationId, authContext);
      const paginated = query?.skip !== undefined || query?.pageSize !== undefined;
      const result = paginated
        ? await store.listBalancesPage(organizationId, filters, query)
        : { items: await store.listBalances(organizationId, filters), total: undefined };
      const balances = result.items;
      const scoped = [];
      for (const balance of balances) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(balance.warehouseId))
        ) {
          continue;
        }
        const cost = await store.findCostState(
          organizationId,
          balance.warehouseId,
          balance.productId,
        );
        const valuation = cost
          ? {
              inventoryValue: toCostStateDto(cost).currentInventoryValue,
              weightedAverageCost: toCostStateDto(cost).weightedAverageCost,
              warehouseProductQuantityBase: toCostStateDto(cost).quantityBase,
            }
          : {
              inventoryValue: { amount: '0.00', currency: 'PKR' },
              weightedAverageCost: { amount: '0.00', currency: 'PKR' },
              warehouseProductQuantityBase: '0.0000',
            };
        scoped.push(toBalanceDto(balance, valuation));
      }
      return { items: scoped, total: result.total ?? scoped.length };
    },

    async listMovements(organizationId, query, authContext) {
      const filters = {};
      if (typeof query?.warehouseId === 'string' && query.warehouseId.trim() !== '') {
        filters.warehouseId = query.warehouseId.trim();
      }
      if (typeof query?.productId === 'string' && query.productId.trim() !== '') {
        filters.productId = query.productId.trim();
      }
      if (typeof query?.batchId === 'string' && query.batchId.trim() !== '') {
        filters.batchId = query.batchId.trim();
      }
      if (!filters.warehouseId) filters.warehouseIds = accessibleWarehouseIds(organizationId, authContext);
      const paginated = query?.skip !== undefined || query?.pageSize !== undefined;
      const result = paginated
        ? await store.listMovementsPage(organizationId, filters, query)
        : { items: await store.listMovements(organizationId, filters), total: undefined };
      const movements = result.items;
      const items = movements
        .filter((item) => {
          if (typeof deps.canAccessWarehouse !== 'function') {
            return true;
          }
          return deps.canAccessWarehouse(authContext, String(item.warehouseId));
        })
        .map(toMovementDto);
      return { items, total: result.total ?? items.length };
    },

    async listMovementsBySource(organizationId, sourceType, sourceId, session) {
      const movements = await store.listMovements(organizationId, {
        sourceType,
        sourceId,
        session,
      });
      return movements.map((item) => ({
        id: String(item['_id']),
        warehouseId: String(item.warehouseId),
        productId: String(item.productId),
        batchId: item.batchId ? String(item.batchId) : null,
        direction: String(item.direction),
        quantityBaseMinorUnits: String(item.quantityBaseMinorUnits),
        enteredQuantityMinorUnits: String(item.enteredQuantityMinorUnits),
        unitCode: String(item.unitCode),
        conversionFactorSnapshot: String(item.conversionFactorSnapshot),
        packagingUnitId: item.packagingUnitId ? String(item.packagingUnitId) : null,
        inventoryValueMinorUnits:
          item.inventoryValueMinorUnits === null || item.inventoryValueMinorUnits === undefined
            ? '0'
            : String(item.inventoryValueMinorUnits),
        stockCondition: String(item.stockCondition ?? 'sellable'),
        sourceType: String(item.sourceType),
        sourceId: String(item.sourceId),
        reversalOfId: item.reversalOfId ? String(item.reversalOfId) : null,
      }));
    },

    async queryExpiry(organizationId, query, authContext) {
      const filters = {};
      if (typeof query?.warehouseId === 'string' && query.warehouseId.trim() !== '') {
        filters.warehouseId = query.warehouseId.trim();
      }
      if (typeof query?.productId === 'string' && query.productId.trim() !== '') {
        filters.productId = query.productId.trim();
      }

      const classificationFilter =
        typeof query?.classification === 'string' && query.classification.trim() !== ''
          ? query.classification.trim()
          : null;

      const businessDate = await resolveBusinessDateForOrganization(organizationId);
      const thresholdDays = await resolveExpiryThresholdDays(organizationId);
      const rows = await store.listPositiveBalancesWithBatchFacts(organizationId, filters);

      const items = [];
      for (const row of rows) {
        if (
          typeof deps.canAccessWarehouse === 'function' &&
          !deps.canAccessWarehouse(authContext, String(row.warehouseId))
        ) {
          continue;
        }
        const classification = classifyExpiry({
          expiryDate: row.expiryDate,
          businessDate,
          thresholdDays,
        });
        if (classification === 'not_applicable') {
          continue;
        }
        if (classificationFilter !== null && classification !== classificationFilter) {
          continue;
        }
        items.push(
          toExpiryItemDto({
            ...row,
            classification,
            businessDate,
            thresholdDays,
          }),
        );
      }

      return { items, businessDate, thresholdDays };
    },

    async allocateStockForProduct(organizationId, input) {
      const product = await catalogService.getProduct(organizationId, input.productId);
      assertActiveProduct(product);

      const businessDate = await resolveBusinessDateForOrganization(organizationId);
      const candidates = await store.listPositiveBalancesWithBatchFacts(organizationId, {
        warehouseId: input.warehouseId,
        productId: input.productId,
      });

      const result = allocateStock({
        trackingMode: product.trackingMode,
        requestedQuantityMinorUnits: BigInt(String(input.quantityBaseMinorUnits)),
        candidates,
        excludeExpired: input.excludeExpired !== false,
        businessDate,
        allowPartial: input.allowPartial === true,
      });

      if (!result.ok && input.allowPartial !== true) {
        throw insufficientStock();
      }

      return {
        productId: input.productId,
        warehouseId: input.warehouseId,
        trackingMode: product.trackingMode,
        businessDate,
        ok: result.ok === true,
        remainingQuantityBaseMinorUnits: String(result.remainingQuantityMinorUnits ?? '0'),
        requestedQuantityBase: formatQuantityMinorUnits(BigInt(String(input.quantityBaseMinorUnits))),
        allocations: result.allocations.map((row) => ({
          batchId: row.batchId ? String(row.batchId) : null,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate,
          quantityBase: formatQuantityMinorUnits(BigInt(String(row.quantityBaseMinorUnits))),
          quantityBaseMinorUnits: String(row.quantityBaseMinorUnits),
        })),
      };
    },

    async postOpeningStock(organizationId, body, actor, idempotencyKey, options = {}) {
      const input = parseOpeningStock(body);

      const postWork = async (session) => {
            const product = await catalogService.getProduct(organizationId, input.productId);
            assertActiveProduct(product);
            assertTrackingInputs(product, input);

            const warehouse = await locationsService.getWarehouse(
              organizationId,
              input.warehouseId,
            );
            assertActiveWarehouse(warehouse);
            const authContext = actor.authContext ?? options.authContext;
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              authContext &&
              !deps.canAccessWarehouse(authContext, String(input.warehouseId))
            ) {
              throw forbidden('Warehouse is not assigned to this user');
            }

            const unitSnapshot = await resolveUnitSnapshot(
              catalogService,
              organizationId,
              product,
              input.packagingUnitId,
            );

            let quantityBaseMinorUnits;
            try {
              quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
                BigInt(input.enteredQuantityMinorUnits),
                unitSnapshot.conversionFactorSnapshot,
              );
            } catch (error) {
              throw validationFailed(error.message || 'Invalid quantity conversion', [
                { field: 'quantity', message: error.message || 'Invalid quantity conversion' },
              ]);
            }

            const postedAt = now();
            const movementId = createObjectId();
            const batch = await resolveOrCreateBatch(
              session,
              organizationId,
              product,
              input,
              postedAt,
            );
            const batchId = batch ? batch['_id'] : null;

            const effects = await postStockMovementEffects(session, organizationId, actor, {
              movementId,
              warehouseId: input.warehouseId,
              productId: input.productId,
              batchId,
              direction: 'inbound',
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: input.enteredQuantityMinorUnits,
              unitCode: unitSnapshot.unitCode,
              conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
              packagingUnitId: unitSnapshot.packagingUnitId,
              inventoryValueMinorUnits: BigInt(input.inventoryValueMinorUnits),
              sourceType: 'opening_stock',
              sourceId: movementId,
              postedAt,
            });

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.opening_stock.posted',
              resourceType: 'stock_movement',
              resourceId: String(effects.movement['_id']),
              metadata: {
                warehouseId: input.warehouseId,
                productId: input.productId,
                batchId: batchId ? String(batchId) : null,
                quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                inventoryValueMinorUnits: input.inventoryValueMinorUnits,
              },
            });

            return toOpeningStockResultDto({
              movement: effects.movement,
              batch,
              balance: effects.balance,
              costState: effects.costState,
            });
      };

      if (options.session) {
        const dto = await postWork(options.session);
        return { replay: false, data: dto, statusCode: 201 };
      }

      const key = requireIdempotencyKey(idempotencyKey);
      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'inventory.opening-stock.post',
        },
        key,
        {
          warehouseId: input.warehouseId,
          productId: input.productId,
          enteredQuantityMinorUnits: input.enteredQuantityMinorUnits,
          packagingUnitId: input.packagingUnitId,
          batchNumber: input.batchNumber,
          manufacturingDate: input.manufacturingDate,
          expiryDate: input.expiryDate,
          inventoryValueMinorUnits: input.inventoryValueMinorUnits,
        },
        async () => {
          const dto = await transactionRunner.run(postWork);
          return { statusCode: 201, body: dto };
        },
      );

      return {
        replay: result.replay,
        data: result.response.body,
        statusCode: result.response.statusCode,
      };
    },

    async listAdjustments(organizationId, query, authContext) {
      const filters = {};
      if (typeof query?.warehouseId === 'string' && query.warehouseId.trim() !== '') {
        filters.warehouseId = query.warehouseId.trim();
      }
      if (typeof query?.status === 'string' && query.status.trim() !== '') {
        filters.status = query.status.trim();
      }
      if (!filters.warehouseId) filters.warehouseIds = accessibleWarehouseIds(organizationId, authContext);
      const paginated = query?.skip !== undefined || query?.pageSize !== undefined;
      const result = paginated
        ? await store.listAdjustmentsPage(organizationId, filters, query)
        : { items: await store.listAdjustments(organizationId, filters), total: undefined };
      const records = result.items;
      const items = records
        .filter((item) => {
          if (typeof deps.canAccessWarehouse !== 'function') {
            return true;
          }
          return deps.canAccessWarehouse(authContext, String(item.warehouseId));
        })
        .map(toAdjustmentDto);
      return { items, total: result.total ?? items.length };
    },

    async getAdjustment(organizationId, adjustmentId, authContext) {
      const record = await store.findAdjustmentById(organizationId, adjustmentId);
      if (record === null) {
        throw notFound('Stock adjustment not found');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(record.warehouseId))
      ) {
        throw notFound('Stock adjustment not found');
      }
      return toAdjustmentDto(record);
    },

    async createAdjustmentDraft(organizationId, body, authContext) {
      const input = parseAdjustmentDraft(body);
      const product = await catalogService.getProduct(organizationId, input.productId);
      assertActiveProduct(product);
      const warehouse = await locationsService.getWarehouse(organizationId, input.warehouseId);
      assertActiveWarehouse(warehouse);

      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(input.warehouseId))
      ) {
        throw forbidden('Warehouse assignment is required');
      }

      const unitSnapshot = await resolveUnitSnapshot(
        catalogService,
        organizationId,
        product,
        input.packagingUnitId,
      );
      const quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
        BigInt(input.enteredQuantityMinorUnits),
        unitSnapshot.conversionFactorSnapshot,
      );
      const direction = adjustmentDirectionForType(input.adjustmentType, input.direction);

      const created = await store.insertAdjustment(null, {
        organizationId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId: input.batchId,
        adjustmentType: input.adjustmentType,
        direction,
        enteredQuantityMinorUnits: input.enteredQuantityMinorUnits,
        quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
        unitCode: unitSnapshot.unitCode,
        conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
        packagingUnitId: unitSnapshot.packagingUnitId,
        inventoryValueMinorUnits: input.inventoryValueMinorUnits,
        reason: input.reason,
        status: 'draft',
        version: 1,
      });

      return toAdjustmentDto(created);
    },

    async updateAdjustmentDraft(organizationId, adjustmentId, body, authContext) {
      const existing = await store.findAdjustmentById(organizationId, adjustmentId);
      if (existing === null) {
        throw notFound('Stock adjustment not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft adjustments can be updated');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Stock adjustment not found');
      }

      const input = parseAdjustmentDraft(body, { partial: true });
      const product = await catalogService.getProduct(
        organizationId,
        input.productId ?? String(existing.productId),
      );
      assertActiveProduct(product);

      const warehouseId = input.warehouseId ?? String(existing.warehouseId);
      const warehouse = await locationsService.getWarehouse(organizationId, warehouseId);
      assertActiveWarehouse(warehouse);

      const unitSnapshot = await resolveUnitSnapshot(
        catalogService,
        organizationId,
        product,
        input.packagingUnitId ?? existing.packagingUnitId,
      );
      const enteredQuantityMinorUnits =
        input.enteredQuantityMinorUnits ?? String(existing.enteredQuantityMinorUnits);
      const quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
        BigInt(enteredQuantityMinorUnits),
        unitSnapshot.conversionFactorSnapshot,
      );
      const adjustmentType = input.adjustmentType ?? existing.adjustmentType;
      const direction = adjustmentDirectionForType(
        adjustmentType,
        input.direction ?? existing.direction,
      );

      const updated = await store.updateAdjustmentConditional(
        null,
        organizationId,
        existing['_id'],
        Number(existing.version),
        {
          warehouseId,
          productId: product.id,
          batchId: input.batchId === undefined ? existing.batchId : input.batchId,
          adjustmentType,
          direction,
          enteredQuantityMinorUnits,
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          unitCode: unitSnapshot.unitCode,
          conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
          packagingUnitId: unitSnapshot.packagingUnitId,
          inventoryValueMinorUnits:
            input.inventoryValueMinorUnits === undefined
              ? existing.inventoryValueMinorUnits
              : input.inventoryValueMinorUnits,
          reason: input.reason === undefined ? existing.reason : input.reason,
        },
      );
      if (updated === null) {
        throw versionConflict('Adjustment version conflict', {
          expectedVersion: Number(existing.version),
        });
      }
      return toAdjustmentDto(updated);
    },

    async discardAdjustmentDraft(organizationId, adjustmentId, authContext) {
      const existing = await store.findAdjustmentById(organizationId, adjustmentId);
      if (existing === null) {
        throw notFound('Stock adjustment not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft adjustments can be discarded');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
      ) {
        throw notFound('Stock adjustment not found');
      }
      const deleted = await store.deleteAdjustmentDraft(null, organizationId, adjustmentId);
      if (!deleted) {
        throw conflict('Only draft adjustments can be discarded');
      }
      await auditWriter.appendBusinessEvent(null, {
        organizationId,
        actorId: authContext.userId,
        action: 'stock_adjustment.draft.discarded',
        resourceType: 'stock_adjustment',
        resourceId: adjustmentId,
        metadata: {},
      });
      return { id: adjustmentId, discarded: true };
    },

    async postAdjustment(organizationId, adjustmentId, body, actor, authContext, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const options = parseAdjustmentPostOptions(body ?? {});

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'inventory.stock-adjustment.post',
        },
        key,
        { adjustmentId },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findAdjustmentById(organizationId, adjustmentId);
            if (existing === null) {
              throw notFound('Stock adjustment not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft adjustments can be posted');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Stock adjustment not found');
            }

            const reason =
              typeof options.reason === 'string' && options.reason.trim() !== ''
                ? options.reason.trim()
                : existing.reason;
            if (typeof reason !== 'string' || reason.trim() === '') {
              throw validationFailed('Adjustment reason is required', [
                { field: 'reason', message: 'reason is required' },
              ]);
            }

            const product = await catalogService.getProduct(organizationId, String(existing.productId));
            assertActiveProduct(product);
            const warehouse = await locationsService.getWarehouse(
              organizationId,
              String(existing.warehouseId),
            );
            assertActiveWarehouse(warehouse);

            const batch = await resolveBatchForAdjustment(
              session,
              organizationId,
              product,
              existing.batchId ? String(existing.batchId) : null,
              null,
            );
            const batchId = batch ? batch['_id'] : null;

            const override = assertNegativeStockOverride(authContext, options);
            const quantityBaseMinorUnits = BigInt(String(existing.quantityBaseMinorUnits));
            const direction = String(existing.direction);

            let inventoryValueMinorUnits = 0n;
            if (direction === 'inbound') {
              if (existing.adjustmentType !== 'correction') {
                throw validationFailed('Inbound adjustments are limited to correction type', [
                  { field: 'adjustmentType', message: 'inbound requires correction' },
                ]);
              }
              if (
                existing.inventoryValueMinorUnits === null ||
                existing.inventoryValueMinorUnits === undefined
              ) {
                throw validationFailed('Correction inbound requires explicit inventory value', [
                  { field: 'inventoryValue', message: 'inventoryValue is required' },
                ]);
              }
              inventoryValueMinorUnits = BigInt(String(existing.inventoryValueMinorUnits));
            }

            const postedAt = now();
            const movementSourceId = createObjectId();
            const effects = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(existing.warehouseId),
              productId: String(existing.productId),
              batchId,
              direction,
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(existing.enteredQuantityMinorUnits),
              unitCode: String(existing.unitCode),
              conversionFactorSnapshot: String(existing.conversionFactorSnapshot),
              packagingUnitId: existing.packagingUnitId,
              inventoryValueMinorUnits,
              sourceType: 'stock_adjustment',
              sourceId: movementSourceId,
              postedAt,
              reason,
              allowNegativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
            });

            const posted = await store.updateAdjustmentConditional(
              session,
              organizationId,
              existing['_id'],
              Number(existing.version),
              {
                batchId,
                status: 'posted',
                reason,
                postedAt,
                postedBy: actor.actorId,
                postedMovementId: effects.movement['_id'],
                negativeStockOverride: override.allowNegativeStockOverride,
                negativeStockOverrideReason: override.reason,
                negativeStockOverrideBy: override.actorId,
              },
            );
            if (posted === null) {
              throw versionConflict('Adjustment version conflict', {
                expectedVersion: Number(existing.version),
              });
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.stock_adjustment.posted',
              resourceType: 'stock_adjustment',
              resourceId: String(posted['_id']),
              metadata: {
                adjustmentType: posted.adjustmentType,
                direction: posted.direction,
                warehouseId: String(posted.warehouseId),
                productId: String(posted.productId),
                batchId: batchId ? String(batchId) : null,
                quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                reason,
                negativeStockOverride: override.allowNegativeStockOverride,
              },
            });

            if (override.allowNegativeStockOverride) {
              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'inventory.negative_stock.override',
                resourceType: 'stock_movement',
                resourceId: String(effects.movement['_id']),
                metadata: {
                  reason: override.reason,
                  warehouseId: String(posted.warehouseId),
                  productId: String(posted.productId),
                  batchId: batchId ? String(batchId) : null,
                  quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                },
              });
            }

            return toAdjustmentDto(posted);
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

    async reverseAdjustment(organizationId, adjustmentId, body, actor, authContext, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const options = parseAdjustmentPostOptions(body ?? {});

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'inventory.stock-adjustment.reverse',
        },
        key,
        { adjustmentId },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const original = await store.findAdjustmentById(organizationId, adjustmentId);
            if (original === null) {
              throw notFound('Stock adjustment not found');
            }
            if (original.status !== 'posted') {
              throw conflict('Only posted adjustments can be reversed');
            }
            if (original.reversedByAdjustmentId !== null && original.reversedByAdjustmentId !== undefined) {
              throw conflict('Adjustment has already been reversed');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(original.warehouseId))
            ) {
              throw notFound('Stock adjustment not found');
            }

            const reason =
              typeof options.reason === 'string' && options.reason.trim() !== ''
                ? options.reason.trim()
                : `Reversal of adjustment ${String(original['_id'])}`;
            const override = assertNegativeStockOverride(authContext, options);

            const reverseDirection = original.direction === 'inbound' ? 'outbound' : 'inbound';
            const quantityBaseMinorUnits = BigInt(String(original.quantityBaseMinorUnits));
            const postedAt = now();

            const reversalDraft = await store.insertAdjustment(session, {
              organizationId,
              warehouseId: original.warehouseId,
              productId: original.productId,
              batchId: original.batchId,
              adjustmentType: original.adjustmentType,
              direction: reverseDirection,
              enteredQuantityMinorUnits: original.enteredQuantityMinorUnits,
              quantityBaseMinorUnits: original.quantityBaseMinorUnits,
              unitCode: original.unitCode,
              conversionFactorSnapshot: original.conversionFactorSnapshot,
              packagingUnitId: original.packagingUnitId,
              inventoryValueMinorUnits: original.inventoryValueMinorUnits,
              reason,
              status: 'posted',
              postedAt,
              postedBy: actor.actorId,
              reversalOfId: original['_id'],
              negativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
              version: 1,
            });

            let inventoryValueMinorUnits = 0n;
            if (reverseDirection === 'inbound' && original.inventoryValueMinorUnits !== null) {
              inventoryValueMinorUnits = BigInt(String(original.inventoryValueMinorUnits));
            }

            const effects = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(original.warehouseId),
              productId: String(original.productId),
              batchId: original.batchId,
              direction: reverseDirection,
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(original.enteredQuantityMinorUnits),
              unitCode: String(original.unitCode),
              conversionFactorSnapshot: String(original.conversionFactorSnapshot),
              packagingUnitId: original.packagingUnitId,
              inventoryValueMinorUnits,
              sourceType: 'stock_adjustment_reversal',
              sourceId: reversalDraft['_id'],
              postedAt,
              reason,
              reversalOfId: original.postedMovementId,
              allowNegativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
            });

            const markedOriginal = await store.updateAdjustmentConditional(
              session,
              organizationId,
              original['_id'],
              Number(original.version),
              {
                status: 'reversed',
                reversedByAdjustmentId: reversalDraft['_id'],
              },
            );
            if (markedOriginal === null) {
              throw versionConflict('Adjustment version conflict', {
                expectedVersion: Number(original.version),
              });
            }

            const linkedReversal = await store.updateAdjustmentConditional(
              session,
              organizationId,
              reversalDraft['_id'],
              1,
              { postedMovementId: effects.movement['_id'] },
            );

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.stock_adjustment.reversed',
              resourceType: 'stock_adjustment',
              resourceId: String(reversalDraft['_id']),
              metadata: {
                reversalOfId: String(original['_id']),
                reason,
              },
            });

            return toAdjustmentDto(linkedReversal ?? reversalDraft);
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

    async listTransfers(organizationId, query, authContext) {
      const filters = {};
      if (typeof query?.status === 'string' && query.status.trim() !== '') {
        filters.status = query.status.trim();
      }
      if (typeof query?.sourceWarehouseId === 'string' && query.sourceWarehouseId.trim() !== '') {
        filters.sourceWarehouseId = query.sourceWarehouseId.trim();
      }
      if (
        typeof query?.destinationWarehouseId === 'string' &&
        query.destinationWarehouseId.trim() !== ''
      ) {
        filters.destinationWarehouseId = query.destinationWarehouseId.trim();
      }
      if (!filters.sourceWarehouseId && !filters.destinationWarehouseId) {
        filters.warehouseIds = accessibleWarehouseIds(organizationId, authContext);
      }
      const paginated = query?.skip !== undefined || query?.pageSize !== undefined;
      const result = paginated
        ? await store.listTransfersPage(organizationId, filters, query)
        : { items: await store.listTransfers(organizationId, filters), total: undefined };
      const items = result.items;
      const mapped = items
        .filter((item) => {
          if (typeof deps.canAccessWarehouse !== 'function') return true;
          return deps.canAccessWarehouse(authContext, String(item.sourceWarehouseId)) && deps.canAccessWarehouse(authContext, String(item.destinationWarehouseId));
        })
        .map(toTransferDto);
      return {
        items: mapped,
        total: result.total ?? mapped.length,
      };
    },

    async getTransfer(organizationId, transferId, authContext) {
      const record = await store.findTransferById(organizationId, transferId);
      if (record === null) {
        throw notFound('Warehouse transfer not found');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        (!deps.canAccessWarehouse(authContext, String(record.sourceWarehouseId)) ||
          !deps.canAccessWarehouse(authContext, String(record.destinationWarehouseId)))
      ) {
        throw notFound('Warehouse transfer not found');
      }
      return toTransferDto(record);
    },

    async createTransferDraft(organizationId, body, authContext) {
      const input = parseTransferDraft(body);
      if (String(input.sourceWarehouseId) === String(input.destinationWarehouseId)) {
        throw validationFailed('source and destination warehouses must differ', [
          { field: 'destinationWarehouseId', message: 'destination must differ from source' },
        ]);
      }

      const product = await catalogService.getProduct(organizationId, input.productId);
      assertActiveProduct(product);
      const sourceWarehouse = await locationsService.getWarehouse(
        organizationId,
        input.sourceWarehouseId,
      );
      assertActiveWarehouse(sourceWarehouse);
      const destinationWarehouse = await locationsService.getWarehouse(
        organizationId,
        input.destinationWarehouseId,
      );
      assertActiveWarehouse(destinationWarehouse);

      if (typeof deps.canAccessWarehouse === 'function') {
        if (!deps.canAccessWarehouse(authContext, String(input.sourceWarehouseId))) {
          throw forbidden('Source warehouse assignment is required');
        }
        if (!deps.canAccessWarehouse(authContext, String(input.destinationWarehouseId))) {
          throw forbidden('Destination warehouse assignment is required');
        }
      }

      if (product.trackingMode !== 'none' && input.batchId === null) {
        throw validationFailed('batchId is required for batch-tracked products', [
          { field: 'batchId', message: 'batchId is required' },
        ]);
      }
      if (product.trackingMode === 'none' && input.batchId !== null) {
        throw validationFailed('batchId is not allowed for products without batch tracking', [
          { field: 'batchId', message: 'batchId is not allowed for trackingMode none' },
        ]);
      }
      if (input.batchId !== null) {
        const batch = await store.findBatchById(organizationId, input.batchId);
        if (batch === null || String(batch.productId) !== String(product.id)) {
          throw notFound('Batch not found');
        }
      }

      const unitSnapshot = await resolveUnitSnapshot(
        catalogService,
        organizationId,
        product,
        input.packagingUnitId,
      );
      const quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
        BigInt(input.enteredQuantityMinorUnits),
        unitSnapshot.conversionFactorSnapshot,
      );

      const created = await store.insertTransfer(null, {
        organizationId,
        sourceWarehouseId: input.sourceWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        productId: input.productId,
        batchId: input.batchId,
        enteredQuantityMinorUnits: input.enteredQuantityMinorUnits,
        quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
        unitCode: unitSnapshot.unitCode,
        conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
        packagingUnitId: unitSnapshot.packagingUnitId,
        reason: input.reason,
        status: 'draft',
        version: 1,
      });
      return toTransferDto(created);
    },

    async updateTransferDraft(organizationId, transferId, body, authContext) {
      const existing = await store.findTransferById(organizationId, transferId);
      if (existing === null) {
        throw notFound('Warehouse transfer not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft transfers can be updated');
      }
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        (!deps.canAccessWarehouse(authContext, String(existing.sourceWarehouseId)) ||
          !deps.canAccessWarehouse(authContext, String(existing.destinationWarehouseId)))
      ) {
        throw notFound('Warehouse transfer not found');
      }

      const input = parseTransferDraft(body, { partial: true });
      const sourceWarehouseId = input.sourceWarehouseId ?? String(existing.sourceWarehouseId);
      const destinationWarehouseId =
        input.destinationWarehouseId ?? String(existing.destinationWarehouseId);
      if (String(sourceWarehouseId) === String(destinationWarehouseId)) {
        throw validationFailed('source and destination warehouses must differ', [
          { field: 'destinationWarehouseId', message: 'destination must differ from source' },
        ]);
      }

      const product = await catalogService.getProduct(
        organizationId,
        input.productId ?? String(existing.productId),
      );
      assertActiveProduct(product);
      assertActiveWarehouse(await locationsService.getWarehouse(organizationId, sourceWarehouseId));
      assertActiveWarehouse(
        await locationsService.getWarehouse(organizationId, destinationWarehouseId),
      );

      const unitSnapshot = await resolveUnitSnapshot(
        catalogService,
        organizationId,
        product,
        input.packagingUnitId === undefined ? existing.packagingUnitId : input.packagingUnitId,
      );
      const enteredQuantityMinorUnits =
        input.enteredQuantityMinorUnits ?? String(existing.enteredQuantityMinorUnits);
      const quantityBaseMinorUnits = convertEnteredQuantityToBaseMinorUnits(
        BigInt(enteredQuantityMinorUnits),
        unitSnapshot.conversionFactorSnapshot,
      );
      const batchId = input.batchId === undefined ? existing.batchId : input.batchId;

      const updated = await store.updateTransferConditional(
        null,
        organizationId,
        existing['_id'],
        Number(existing.version),
        {
          sourceWarehouseId,
          destinationWarehouseId,
          productId: product.id,
          batchId,
          enteredQuantityMinorUnits,
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          unitCode: unitSnapshot.unitCode,
          conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
          packagingUnitId: unitSnapshot.packagingUnitId,
          reason: input.reason === undefined ? existing.reason : input.reason,
        },
      );
      if (updated === null) {
        throw versionConflict('Transfer version conflict', {
          expectedVersion: Number(existing.version),
        });
      }
      return toTransferDto(updated);
    },

    async discardTransferDraft(organizationId, transferId, authContext) {
      const existing = await store.findTransferById(organizationId, transferId);
      if (existing === null) {
        throw notFound('Warehouse transfer not found');
      }
      if (existing.status !== 'draft') {
        throw conflict('Only draft transfers can be discarded');
      }
      if (typeof deps.canAccessWarehouse === 'function') {
        if (
          !deps.canAccessWarehouse(authContext, String(existing.sourceWarehouseId)) ||
          !deps.canAccessWarehouse(authContext, String(existing.destinationWarehouseId))
        ) {
          throw notFound('Warehouse transfer not found');
        }
      }
      const deleted = await store.deleteTransferDraft(null, organizationId, transferId);
      if (!deleted) {
        throw conflict('Only draft transfers can be discarded');
      }
      await auditWriter.appendBusinessEvent(null, {
        organizationId,
        actorId: authContext.userId,
        action: 'warehouse_transfer.draft.discarded',
        resourceType: 'warehouse_transfer',
        resourceId: transferId,
        metadata: {},
      });
      return { id: transferId, discarded: true };
    },

    async postTransfer(organizationId, transferId, body, actor, authContext, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const options = parseTransferPostOptions(body ?? {});

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'inventory.warehouse-transfer.post',
        },
        key,
        {
          transferId,
          reason: options.reason,
          negativeStockOverride: options.negativeStockOverride === true,
          negativeStockOverrideReason: options.negativeStockOverrideReason,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const existing = await store.findTransferById(organizationId, transferId);
            if (existing === null) {
              throw notFound('Warehouse transfer not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft transfers can be posted');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              (!deps.canAccessWarehouse(authContext, String(existing.sourceWarehouseId)) ||
                !deps.canAccessWarehouse(authContext, String(existing.destinationWarehouseId)))
            ) {
              throw notFound('Warehouse transfer not found');
            }
            if (String(existing.sourceWarehouseId) === String(existing.destinationWarehouseId)) {
              throw validationFailed('source and destination warehouses must differ', [
                {
                  field: 'destinationWarehouseId',
                  message: 'destination must differ from source',
                },
              ]);
            }

            const product = await catalogService.getProduct(
              organizationId,
              String(existing.productId),
            );
            assertActiveProduct(product);
            assertActiveWarehouse(
              await locationsService.getWarehouse(
                organizationId,
                String(existing.sourceWarehouseId),
              ),
            );
            assertActiveWarehouse(
              await locationsService.getWarehouse(
                organizationId,
                String(existing.destinationWarehouseId),
              ),
            );

            let batchId = existing.batchId ? String(existing.batchId) : null;
            if (product.trackingMode === 'none') {
              batchId = null;
            } else {
              if (batchId === null) {
                throw validationFailed('batchId is required for batch-tracked products', [
                  { field: 'batchId', message: 'batchId is required' },
                ]);
              }
              const batch = await store.findBatchById(organizationId, batchId);
              if (batch === null || String(batch.productId) !== String(product.id)) {
                throw notFound('Batch not found');
              }
              batchId = String(batch['_id']);
            }

            const override = assertNegativeStockOverride(authContext, options);
            const quantityBaseMinorUnits = BigInt(String(existing.quantityBaseMinorUnits));
            const postedAt = now();
            const transferSourceId = existing['_id'];

            const outbound = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(existing.sourceWarehouseId),
              productId: String(existing.productId),
              batchId,
              direction: 'outbound',
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(existing.enteredQuantityMinorUnits),
              unitCode: String(existing.unitCode),
              conversionFactorSnapshot: String(existing.conversionFactorSnapshot),
              packagingUnitId: existing.packagingUnitId,
              inventoryValueMinorUnits: 0n,
              sourceType: 'warehouse_transfer',
              sourceId: transferSourceId,
              postedAt,
              reason: existing.reason,
              allowNegativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
            });

            const transferValueMinorUnits = BigInt(
              String(outbound.movement.inventoryValueMinorUnits ?? '0'),
            );

            const inbound = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(existing.destinationWarehouseId),
              productId: String(existing.productId),
              batchId,
              direction: 'inbound',
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(existing.enteredQuantityMinorUnits),
              unitCode: String(existing.unitCode),
              conversionFactorSnapshot: String(existing.conversionFactorSnapshot),
              packagingUnitId: existing.packagingUnitId,
              inventoryValueMinorUnits: transferValueMinorUnits,
              sourceType: 'warehouse_transfer',
              sourceId: transferSourceId,
              postedAt,
              reason: existing.reason,
              allowNegativeStockOverride: false,
            });

            const posted = await store.updateTransferConditional(
              session,
              organizationId,
              existing['_id'],
              Number(existing.version),
              {
                batchId,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                outboundMovementId: outbound.movement['_id'],
                inboundMovementId: inbound.movement['_id'],
                transferValueMinorUnits: transferValueMinorUnits.toString(),
                negativeStockOverride: override.allowNegativeStockOverride,
                negativeStockOverrideReason: override.reason,
                negativeStockOverrideBy: override.actorId,
              },
            );
            if (posted === null) {
              throw versionConflict('Transfer version conflict', {
                expectedVersion: Number(existing.version),
              });
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.warehouse_transfer.posted',
              resourceType: 'warehouse_transfer',
              resourceId: String(posted['_id']),
              metadata: {
                sourceWarehouseId: String(posted.sourceWarehouseId),
                destinationWarehouseId: String(posted.destinationWarehouseId),
                productId: String(posted.productId),
                batchId: batchId ? String(batchId) : null,
                quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                transferValueMinorUnits: transferValueMinorUnits.toString(),
                outboundMovementId: String(outbound.movement['_id']),
                inboundMovementId: String(inbound.movement['_id']),
                negativeStockOverride: override.allowNegativeStockOverride,
              },
            });

            if (override.allowNegativeStockOverride) {
              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'inventory.negative_stock.override',
                resourceType: 'stock_movement',
                resourceId: String(outbound.movement['_id']),
                metadata: {
                  reason: override.reason,
                  warehouseId: String(posted.sourceWarehouseId),
                  productId: String(posted.productId),
                  batchId: batchId ? String(batchId) : null,
                  quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                },
              });
            }

            return toTransferDto(posted);
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

    async reverseTransfer(organizationId, transferId, body, actor, authContext, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const options = parseTransferPostOptions(body ?? {});

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'inventory.warehouse-transfer.reverse',
        },
        key,
        {
          transferId,
          reason: options.reason,
          negativeStockOverride: options.negativeStockOverride === true,
          negativeStockOverrideReason: options.negativeStockOverrideReason,
        },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const original = await store.findTransferById(organizationId, transferId);
            if (original === null) {
              throw notFound('Warehouse transfer not found');
            }
            if (original.status !== 'posted') {
              throw conflict('Only posted transfers can be reversed');
            }
            if (
              original.reversedByTransferId !== null &&
              original.reversedByTransferId !== undefined
            ) {
              throw conflict('Transfer has already been reversed');
            }
            if (
              typeof deps.canAccessWarehouse === 'function' &&
              (!deps.canAccessWarehouse(authContext, String(original.sourceWarehouseId)) ||
                !deps.canAccessWarehouse(authContext, String(original.destinationWarehouseId)))
            ) {
              throw notFound('Warehouse transfer not found');
            }

            const reason =
              typeof options.reason === 'string' && options.reason.trim() !== ''
                ? options.reason.trim()
                : `Reversal of transfer ${String(original['_id'])}`;
            const override = assertNegativeStockOverride(authContext, options);
            const quantityBaseMinorUnits = BigInt(String(original.quantityBaseMinorUnits));
            const postedAt = now();
            const batchId = original.batchId ? String(original.batchId) : null;

            const reversalDraft = await store.insertTransfer(session, {
              organizationId,
              sourceWarehouseId: original.destinationWarehouseId,
              destinationWarehouseId: original.sourceWarehouseId,
              productId: original.productId,
              batchId: original.batchId,
              enteredQuantityMinorUnits: original.enteredQuantityMinorUnits,
              quantityBaseMinorUnits: original.quantityBaseMinorUnits,
              unitCode: original.unitCode,
              conversionFactorSnapshot: original.conversionFactorSnapshot,
              packagingUnitId: original.packagingUnitId,
              reason,
              status: 'posted',
              postedAt,
              postedBy: actor.actorId,
              reversalOfId: original['_id'],
              negativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
              version: 1,
            });

            const outbound = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(original.destinationWarehouseId),
              productId: String(original.productId),
              batchId,
              direction: 'outbound',
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(original.enteredQuantityMinorUnits),
              unitCode: String(original.unitCode),
              conversionFactorSnapshot: String(original.conversionFactorSnapshot),
              packagingUnitId: original.packagingUnitId,
              inventoryValueMinorUnits: 0n,
              sourceType: 'warehouse_transfer_reversal',
              sourceId: reversalDraft['_id'],
              postedAt,
              reason,
              reversalOfId: original.inboundMovementId,
              allowNegativeStockOverride: override.allowNegativeStockOverride,
              negativeStockOverrideReason: override.reason,
              negativeStockOverrideBy: override.actorId,
            });

            const transferValueMinorUnits = BigInt(
              String(outbound.movement.inventoryValueMinorUnits ?? '0'),
            );

            const inbound = await postStockMovementEffects(session, organizationId, actor, {
              warehouseId: String(original.sourceWarehouseId),
              productId: String(original.productId),
              batchId,
              direction: 'inbound',
              quantityBaseMinorUnits,
              enteredQuantityMinorUnits: String(original.enteredQuantityMinorUnits),
              unitCode: String(original.unitCode),
              conversionFactorSnapshot: String(original.conversionFactorSnapshot),
              packagingUnitId: original.packagingUnitId,
              inventoryValueMinorUnits: transferValueMinorUnits,
              sourceType: 'warehouse_transfer_reversal',
              sourceId: reversalDraft['_id'],
              postedAt,
              reason,
              reversalOfId: original.outboundMovementId,
              allowNegativeStockOverride: false,
            });

            const markedOriginal = await store.updateTransferConditional(
              session,
              organizationId,
              original['_id'],
              Number(original.version),
              {
                status: 'reversed',
                reversedByTransferId: reversalDraft['_id'],
              },
            );
            if (markedOriginal === null) {
              throw versionConflict('Transfer version conflict', {
                expectedVersion: Number(original.version),
              });
            }

            const linkedReversal = await store.updateTransferConditional(
              session,
              organizationId,
              reversalDraft['_id'],
              1,
              {
                outboundMovementId: outbound.movement['_id'],
                inboundMovementId: inbound.movement['_id'],
                transferValueMinorUnits: transferValueMinorUnits.toString(),
              },
            );

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.warehouse_transfer.reversed',
              resourceType: 'warehouse_transfer',
              resourceId: String(reversalDraft['_id']),
              metadata: {
                reversalOfId: String(original['_id']),
                reason,
                outboundMovementId: String(outbound.movement['_id']),
                inboundMovementId: String(inbound.movement['_id']),
              },
            });

            return toTransferDto(linkedReversal ?? reversalDraft);
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

    async reconcileInventory(organizationId, authContext) {
      void authContext;
      const [movements, balances, costStates] = await Promise.all([
        store.listAllMovements(organizationId),
        store.listAllBalances(organizationId),
        store.listAllCostStates(organizationId),
      ]);
      return toReconciliationDto(
        reconcileInventoryState({ movements, balances, costStates }),
      );
    },

    /**
     * Session-scoped inbound receipt for purchase (and similar) orchestration.
     * Caller owns the transaction; Inventory must not commit independently.
     */
    async postInboundReceiptInSession(session, organizationId, actor, input) {
      const product = await catalogService.getProduct(organizationId, input.productId);
      assertActiveProduct(product);

      if (product.trackingMode === 'none') {
        if (input.batchNumber || input.batchId) {
          throw validationFailed('batchNumber is not allowed for products without batch tracking', [
            { field: 'batchNumber', message: 'batchNumber is not allowed' },
          ]);
        }
      } else if (!input.batchId && !input.batchNumber) {
        throw validationFailed('batchNumber is required for batch-tracked products', [
          { field: 'batchNumber', message: 'batchNumber is required' },
        ]);
      }

      if (
        product.trackingMode === 'batch_expiry' &&
        !input.batchId &&
        !input.expiryDate
      ) {
        throw validationFailed('expiryDate is required for batch_expiry tracking', [
          { field: 'expiryDate', message: 'expiryDate is required' },
        ]);
      }

      const postedAt = input.postedAt ?? now();
      let batch;
      let batchId;

      if (input.batchId) {
        batch = await store.findBatchById(organizationId, input.batchId);
        if (batch === null || String(batch.productId) !== String(input.productId)) {
          throw validationFailed('batchId does not match product', [
            { field: 'batchId', message: 'batch must belong to the product' },
          ]);
        }
        batchId = batch['_id'];
      } else {
        batch = await resolveOrCreateBatch(
          session,
          organizationId,
          product,
          {
            batchNumber: input.batchNumber ?? null,
            manufacturingDate: input.manufacturingDate ?? null,
            expiryDate: input.expiryDate ?? null,
          },
          postedAt,
        );
        batchId = batch ? batch['_id'] : null;
      }

      const effects = await postStockMovementEffects(session, organizationId, actor, {
        movementId: input.movementId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId,
        direction: 'inbound',
        quantityBaseMinorUnits: BigInt(String(input.quantityBaseMinorUnits)),
        enteredQuantityMinorUnits: String(input.enteredQuantityMinorUnits),
        unitCode: input.unitCode,
        conversionFactorSnapshot: String(input.conversionFactorSnapshot),
        packagingUnitId: input.packagingUnitId ?? null,
        inventoryValueMinorUnits: BigInt(String(input.inventoryValueMinorUnits)),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        stockCondition: input.stockCondition === 'unsellable' ? 'unsellable' : 'sellable',
        postedAt,
        reason: input.reason ?? null,
        correctionOfId: input.correctionOfId ?? null,
        reversalOfId: input.reversalOfId ?? null,
      });

      return {
        movement: effects.movement,
        balance: effects.balance,
        costState: effects.costState,
        batch,
        batchId: batchId ? String(batchId) : null,
      };
    },

    /**
     * Session-scoped outbound issue for purchase cancellation / purchase return.
     * Uses explicit inventory value from original receipt cost when provided (BR-RETURN-012/013).
     * Negative-stock override is never allowed for purchase-return orchestration.
     */
    async postOutboundIssueInSession(session, organizationId, actor, input) {
      const product = await catalogService.getProduct(organizationId, input.productId);
      assertActiveProduct(product);

      const batchId = input.batchId ?? null;
      if (product.trackingMode === 'none') {
        if (batchId) {
          throw validationFailed('batchId is not allowed for products without batch tracking', [
            { field: 'batchId', message: 'batchId is not allowed' },
          ]);
        }
      } else if (!batchId) {
        throw validationFailed('batchId is required for batch-tracked products', [
          { field: 'batchId', message: 'batchId is required' },
        ]);
      }

      if (batchId) {
        const batch = await store.findBatchById(organizationId, batchId);
        if (batch === null || String(batch.productId) !== String(input.productId)) {
          throw validationFailed('batchId does not match product', [
            { field: 'batchId', message: 'batch must belong to the product' },
          ]);
        }
      }

      const postedAt = input.postedAt ?? now();
      const allowNegativeStockOverride = input.allowNegativeStockOverride === true;
      const effects = await postStockMovementEffects(session, organizationId, actor, {
        movementId: input.movementId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId,
        direction: 'outbound',
        quantityBaseMinorUnits: BigInt(String(input.quantityBaseMinorUnits)),
        enteredQuantityMinorUnits: String(input.enteredQuantityMinorUnits),
        unitCode: input.unitCode,
        conversionFactorSnapshot: String(input.conversionFactorSnapshot),
        packagingUnitId: input.packagingUnitId ?? null,
        inventoryValueMinorUnits: input.inventoryValueMinorUnits,
        useExplicitOutboundValue: input.useExplicitOutboundValue === true,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        stockCondition: input.stockCondition === 'unsellable' ? 'unsellable' : 'sellable',
        postedAt,
        reason: input.reason ?? null,
        correctionOfId: input.correctionOfId ?? null,
        reversalOfId: input.reversalOfId ?? null,
        allowNegativeStockOverride,
        negativeStockOverrideReason: allowNegativeStockOverride
          ? input.negativeStockOverrideReason ?? null
          : null,
        negativeStockOverrideBy: allowNegativeStockOverride
          ? input.negativeStockOverrideBy ?? actor.actorId
          : null,
      });

      return {
        movement: effects.movement,
        balance: effects.balance,
        costState: effects.costState,
        batchId: batchId ? String(batchId) : null,
      };
    },

    async getWarehouseProductCostState(organizationId, warehouseId, productId) {
      const cost = await store.findCostState(organizationId, warehouseId, productId);
      if (cost === null) {
        return {
          warehouseId: String(warehouseId),
          productId: String(productId),
          quantityBaseMinorUnits: '0',
          inventoryValueMinorUnits: '0',
          weightedAverageCostMinorUnits: '0',
        };
      }
      return {
        warehouseId: String(cost.warehouseId),
        productId: String(cost.productId),
        quantityBaseMinorUnits: String(cost.quantityBaseMinorUnits ?? '0'),
        inventoryValueMinorUnits: String(cost.inventoryValueMinorUnits ?? '0'),
        weightedAverageCostMinorUnits: String(cost.weightedAverageCostMinorUnits ?? '0'),
      };
    },
  };
}

module.exports = {
  createInventoryService,
};
