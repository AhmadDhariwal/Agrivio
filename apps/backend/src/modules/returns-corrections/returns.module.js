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
  convertEnteredQuantityToBaseMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { parsePurchaseReturnDraft, parseReturnPost, toReturnDto } = require('./returns.validation');
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

function createReturnsService(deps) {
  const store = deps.store;
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

  return {
    async listReturns(organizationId, query = {}, authContext) {
      const items = await store.listReturns(organizationId, {
        status: query.status,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
        purchaseId: query.purchaseId,
      });
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
      return { items: filtered };
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
            const existing = await store.findReturnById(organizationId, returnId);
            if (existing === null) {
              throw notFound('Return not found');
            }
            if (existing.status !== 'draft') {
              throw conflict('Only draft returns can be posted');
            }
            assertOptimisticVersion(existing, input.expectedVersion);

            if (String(existing.returnType) === 'purchase') {
              if (!hasPermission(authContext?.permissions ?? [], 'purchases.return')) {
                throw forbidden('Missing permission purchases.return');
              }
              if (!hasPermission(authContext?.permissions ?? [], 'returns.post')) {
                throw forbidden('Missing permission returns.post');
              }
            }

            if (
              typeof deps.canAccessWarehouse === 'function' &&
              !deps.canAccessWarehouse(authContext, String(existing.warehouseId))
            ) {
              throw notFound('Return not found');
            }

            await assertWarehouseAccess(authContext, String(existing.warehouseId));

            const purchase = await resolvePurchaseSource(
              organizationId,
              String(existing.purchaseId),
            );
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
              const alreadyReturnedStr =
                await store.sumPostedReturnedQuantityByPurchaseLine(
                  organizationId,
                  String(existing.purchaseId),
                  origIdx,
                );
              const alreadyReturned = BigInt(alreadyReturnedStr);
              const returnableQty = originalQtyBase - alreadyReturned;
              const requestedQty = BigInt(String(line.quantityBaseMinorUnits));

              if (requestedQty > returnableQty) {
                throw validationFailed(
                  `lines[${index}]: return quantity exceeds returnable quantity`,
                  [
                    {
                      field: `lines[${index}].quantity`,
                      message: 'return quantity exceeds what is returnable for this purchase line',
                    },
                  ],
                );
              }

              const expectedBatchId = purchaseLine.batchId
                ? String(purchaseLine.batchId)
                : null;
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
              const proportionalValue =
                originalQtyBase > 0n
                  ? (originalReceiptValue * requestedQty) / originalQtyBase
                  : 0n;

              const receiptUnitCost =
                requestedQty > 0n ? proportionalValue / requestedQty : 0n;

              const outboundResult = await inventoryService.postOutboundIssueInSession(
                session,
                organizationId,
                actor,
                {
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
                },
              );

              void outboundResult;

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
              if (!accountsService) {
                throw validationFailed('accountsService is required for account_refund resolution');
              }
              const account = await accountsService.getAccount(
                organizationId,
                input.refundAccountId,
              );
              if (account.status !== 'active') {
                throw validationFailed('Refund account must be active', [
                  { field: 'refundAccountId', message: 'account must be active' },
                ]);
              }
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

            const updated = await store.updateReturnIfPosted(session, organizationId, returnId, {
              reason: input.reason,
              resolution: input.resolution,
              refundAccountId: input.refundAccountId ?? null,
              lines: postedLines,
              returnTotalMinorUnits: returnTotal.toString(),
              status: 'posted',
              postedAt,
              postedBy: actor.actorId,
              updatedAt: postedAt,
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
                returnType: String(existing.returnType),
                purchaseId: String(existing.purchaseId),
                returnTotalMinorUnits: returnTotal.toString(),
                resolution: input.resolution,
                lineCount: postedLines.length,
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
  };
}

module.exports = {
  createReturnsService,
  createReturnsModule,
  createInMemoryReturnsStore,
  createMongooseReturnsStore,
};
