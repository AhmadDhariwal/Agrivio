const mongoose = require('mongoose');
const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const {
  convertEnteredQuantityToBaseMinorUnits,
  formatQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const { applyInboundWac } = require('./wac');
const {
  parseOpeningStock,
  toBatchDto,
  toMovementDto,
  toBalanceDto,
  toCostStateDto,
  toOpeningStockResultDto,
} = require('./inventory.validation');
const {
  createInMemoryInventoryStore,
  createMongooseInventoryStore,
} = require('./inventory.store');

function createMongooseTransactionSessionPort() {
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
    throw validationFailed('Opening stock requires an active product', [
      { field: 'productId', message: 'product must be active' },
    ]);
  }
}

function assertActiveWarehouse(warehouse) {
  if (warehouse.status !== 'active') {
    throw validationFailed('Opening stock requires an active warehouse', [
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

  if (mode === 'batch_expiry') {
    if (input.expiryDate === null) {
      throw validationFailed('expiryDate is required for batch_expiry tracking', [
        { field: 'expiryDate', message: 'expiryDate is required' },
      ]);
    }
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

function createInventoryService(deps) {
  const store = deps.store;
  const catalogService = deps.catalogService;
  const locationsService = deps.locationsService;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const createObjectId = deps.createObjectId ?? (() => new mongoose.Types.ObjectId());
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function applyBalanceInbound(session, organizationId, scope, quantityBaseMinorUnits) {
    const existing = await store.findBalance(
      organizationId,
      scope.warehouseId,
      scope.productId,
      scope.batchId,
    );
    if (existing === null) {
      try {
        return await store.insertBalance(session, {
          organizationId,
          warehouseId: scope.warehouseId,
          productId: scope.productId,
          batchId: scope.batchId,
          quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
          version: 1,
        });
      } catch (error) {
        mapDuplicate(error, 'Concurrent stock balance update detected');
      }
    }

    const nextQty =
      BigInt(String(existing.quantityBaseMinorUnits)) + quantityBaseMinorUnits;
    const updated = await store.updateBalanceConditional(
      session,
      organizationId,
      existing['_id'],
      Number(existing.version),
      { quantityBaseMinorUnits: nextQty.toString() },
    );
    if (updated === null) {
      throw conflict('Concurrent stock balance update detected');
    }
    return updated;
  }

  async function applyCostInbound(session, organizationId, scope, receipt) {
    const existing = await store.findCostState(
      organizationId,
      scope.warehouseId,
      scope.productId,
    );
    const prior = existing
      ? {
          quantityBaseMinorUnits: BigInt(String(existing.quantityBaseMinorUnits)),
          inventoryValueMinorUnits: BigInt(String(existing.inventoryValueMinorUnits)),
          weightedAverageCostMinorUnits: BigInt(String(existing.weightedAverageCostMinorUnits)),
        }
      : {
          quantityBaseMinorUnits: 0n,
          inventoryValueMinorUnits: 0n,
          weightedAverageCostMinorUnits: 0n,
        };

    const next = applyInboundWac(prior, receipt);

    if (existing === null) {
      try {
        return {
          costState: await store.insertCostState(session, {
            organizationId,
            warehouseId: scope.warehouseId,
            productId: scope.productId,
            quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
            inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
            weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
            lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
            version: 1,
          }),
          receiptUnitCostMinorUnits: next.receiptUnitCostMinorUnits,
        };
      } catch (error) {
        mapDuplicate(error, 'Concurrent inventory cost update detected');
      }
    }

    const updated = await store.updateCostStateConditional(
      session,
      organizationId,
      existing['_id'],
      Number(existing.version),
      {
        quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
        inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
        weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
        lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
      },
    );
    if (updated === null) {
      throw conflict('Concurrent inventory cost update detected');
    }
    return {
      costState: updated,
      receiptUnitCostMinorUnits: next.receiptUnitCostMinorUnits,
    };
  }

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
        throw conflict('Existing batch expiry does not match opening stock expiry');
      }
      if (
        input.manufacturingDate !== null &&
        existing.manufacturingDate !== null &&
        String(existing.manufacturingDate) !== String(input.manufacturingDate)
      ) {
        throw conflict('Existing batch manufacturing date does not match');
      }
      return existing;
    }

    try {
      return await store.insertBatch(session, {
        organizationId,
        productId: product.id,
        batchNumber: input.batchNumber,
        manufacturingDate: input.manufacturingDate,
        expiryDate: product.trackingMode === 'batch_expiry' ? input.expiryDate : input.expiryDate,
        firstReceivedAt: postedAt,
      });
    } catch (error) {
      mapDuplicate(error, 'Batch identity already exists for this product');
    }
  }

  return {
    async listBatches(organizationId, query) {
      const filters = {};
      if (typeof query?.productId === 'string' && query.productId.trim() !== '') {
        filters.productId = query.productId.trim();
      }
      const items = await store.listBatches(organizationId, filters);
      return { items: items.map(toBatchDto) };
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

      const balances = await store.listBalances(organizationId, filters);
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
      return { items: scoped };
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

      const movements = await store.listMovements(organizationId, filters);
      const items = movements
        .filter((item) => {
          if (typeof deps.canAccessWarehouse !== 'function') {
            return true;
          }
          return deps.canAccessWarehouse(authContext, String(item.warehouseId));
        })
        .map(toMovementDto);
      return { items };
    },

    async postOpeningStock(organizationId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseOpeningStock(body);

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
          const dto = await transactionRunner.run(async (session) => {
            const product = await catalogService.getProduct(organizationId, input.productId);
            assertActiveProduct(product);
            assertTrackingInputs(product, input);

            const warehouse = await locationsService.getWarehouse(
              organizationId,
              input.warehouseId,
            );
            assertActiveWarehouse(warehouse);

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
            const batch = await resolveOrCreateBatch(
              session,
              organizationId,
              product,
              input,
              postedAt,
            );
            const batchId = batch ? batch['_id'] : null;

            const costResult = await applyCostInbound(
              session,
              organizationId,
              {
                warehouseId: input.warehouseId,
                productId: input.productId,
              },
              {
                quantityBaseMinorUnits,
                inventoryValueMinorUnits: BigInt(input.inventoryValueMinorUnits),
              },
            );

            const balance = await applyBalanceInbound(
              session,
              organizationId,
              {
                warehouseId: input.warehouseId,
                productId: input.productId,
                batchId,
              },
              quantityBaseMinorUnits,
            );

            const movementId = createObjectId();
            let movement;
            try {
              movement = await store.insertMovement(session, {
                _id: movementId,
                organizationId,
                warehouseId: input.warehouseId,
                productId: input.productId,
                batchId,
                direction: 'inbound',
                quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
                enteredQuantityMinorUnits: input.enteredQuantityMinorUnits,
                unitCode: unitSnapshot.unitCode,
                conversionFactorSnapshot: unitSnapshot.conversionFactorSnapshot,
                packagingUnitId: unitSnapshot.packagingUnitId,
                inventoryValueMinorUnits: input.inventoryValueMinorUnits,
                unitCostMinorUnits: costResult.receiptUnitCostMinorUnits.toString(),
                sourceType: 'opening_stock',
                sourceId: movementId,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
                correctionOfId: null,
                reversalOfId: null,
              });
            } catch (error) {
              mapDuplicate(error, 'Opening stock movement already exists');
            }

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'inventory.opening_stock.posted',
              resourceType: 'stock_movement',
              resourceId: String(movement['_id']),
              metadata: {
                warehouseId: input.warehouseId,
                productId: input.productId,
                batchId: batchId ? String(batchId) : null,
                quantityBase: formatQuantityMinorUnits(quantityBaseMinorUnits),
                inventoryValueMinorUnits: input.inventoryValueMinorUnits,
              },
            });

            return toOpeningStockResultDto({
              movement,
              batch,
              balance,
              costState: costResult.costState,
            });
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

function createInventoryModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseInventoryStore()
      : createInMemoryInventoryStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const idempotencyStore =
    options.idempotencyStore ??
    (persistence === 'mongoose'
      ? createMongooseIdempotencyStore()
      : createInMemoryIdempotencyStore());
  const idempotency = options.idempotency ?? createIdempotencyService(idempotencyStore);

  const inventoryService = createInventoryService({
    store,
    catalogService: options.catalogService,
    locationsService: options.locationsService,
    transactionRunner,
    idempotency,
    canAccessWarehouse: options.canAccessWarehouse,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.createObjectId === undefined ? {} : { createObjectId: options.createObjectId }),
  });

  return { store, inventoryService };
}

module.exports = {
  createInventoryService,
  createInventoryModule,
  createInMemoryInventoryStore,
  createMongooseInventoryStore,
};
