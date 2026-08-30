const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const { assertMasterUnused } = require('../../platform/lifecycle/record-in-use');
const {
  assertCreationLimit,
  attachSoftWarning,
} = require('../subscriptions/creation-limit');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const {
  parseSupplierCreate,
  parseSupplierPatch,
  parseSupplierOpeningBalance,
  toSupplierDto,
} = require('./suppliers.validation');
const {
  createInMemorySuppliersStore,
  createMongooseSuppliersStore,
} = require('./suppliers.store');

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

function createSuppliersService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const ledgersService = deps.ledgersService;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function buildSupplierDto(organizationId, record) {
    if (!ledgersService) {
      return toSupplierDto(record);
    }
    const supplierId = String(record['_id']);
    const [payable, advance] = await Promise.all([
      ledgersService.sumSupplierPayable(organizationId, supplierId),
      ledgersService.sumSupplierAdvance(organizationId, supplierId),
    ]);
    return toSupplierDto(record, { payable, advance });
  }

  return {
    async listSuppliers(organizationId, options = {}) {
      const { status, search, skip, pageSize } = options;
      const { items, total } = await store.listSuppliers(
        organizationId,
        { status, search },
        skip !== undefined || pageSize !== undefined ? { skip, pageSize } : {},
      );
      if (!ledgersService || typeof ledgersService.mapPartyBalances !== 'function') {
        const mapped = [];
        for (const item of items) {
          mapped.push(await buildSupplierDto(organizationId, item));
        }
        return { items: mapped, total };
      }
      const [payableMap, advanceMap] = await Promise.all([
        ledgersService.mapPartyBalances(organizationId, 'supplier', 'payable'),
        ledgersService.mapPartyBalances(organizationId, 'supplier', 'supplier_advance'),
      ]);
      const zero = { amount: '0.00', currency: 'PKR' };
      return {
        items: items.map((item) =>
          toSupplierDto(item, {
            payable: payableMap.get(String(item['_id'])) ?? zero,
            advance: advanceMap.get(String(item['_id'])) ?? zero,
          }),
        ),
        total,
      };
    },

    async getSupplier(organizationId, supplierId) {
      const record = await store.findSupplierById(organizationId, supplierId);
      if (record === null) {
        throw notFound('Supplier not found');
      }
      return buildSupplierDto(organizationId, record);
    },

    async findSupplierByName(organizationId, name) {
      const needle = String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return null;
      }
      const { items } = await store.listSuppliers(organizationId);
      const found = items.find((item) => String(item.nameNormalized) === needle);
      return found ? toSupplierDto(found) : null;
    },

    async createSupplier(organizationId, body, actor, options = {}) {
      const input = parseSupplierCreate(body);
      if (typeof deps.capabilityService?.assertSupplierCreateAllowed === 'function') {
        await deps.capabilityService.assertSupplierCreateAllowed(organizationId);
      }
      const currentUsage = await store.countSuppliers(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'suppliers',
        currentUsage,
      );

      try {
        return await transactionRunner.runWithOptionalSession(options.session, async (session) => {
          const created = await store.insertSupplier(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'supplier.created',
            resourceType: 'supplier',
            resourceId: String(created['_id']),
          });
          return attachSoftWarning(toSupplierDto(created), entitlement);
        });
      } catch (error) {
        mapDuplicate(error, 'Supplier name already exists in this organization');
      }
    },

    async updateSupplier(organizationId, supplierId, body, actor) {
      const { expectedVersion, patch } = parseSupplierPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findSupplierById(organizationId, supplierId);
          if (current === null) {
            throw notFound('Supplier not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          if (typeof deps.capabilityService?.assertSupplierPatchAllowed === 'function') {
            await deps.capabilityService.assertSupplierPatchAllowed(organizationId, current, patch);
          }
          const updated = await store.updateSupplier(session, organizationId, supplierId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'supplier.updated',
            resourceType: 'supplier',
            resourceId: supplierId,
            metadata: { fields: Object.keys(patch) },
          });
          return toSupplierDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Supplier name already exists in this organization');
      }
    },

    async deleteSupplier(organizationId, supplierId, actor) {
      const current = await store.findSupplierById(organizationId, supplierId);
      if (current === null) {
        throw notFound('Supplier not found');
      }
      if (typeof deps.capabilityService?.assertSupplierDeleteAllowed === 'function') {
        await deps.capabilityService.assertSupplierDeleteAllowed(organizationId);
      }
      const reasons = [];
      if (current.openingBalance && current.openingBalance.status === 'posted') {
        reasons.push('opening balance');
      }
      if (typeof deps.listSupplierReferences === 'function') {
        reasons.push(...(await deps.listSupplierReferences(organizationId, supplierId)));
      }
      assertMasterUnused(reasons);
      return transactionRunner.run(async (session) => {
        const deleted = await store.deleteSupplier(session, organizationId, supplierId);
        if (!deleted) {
          throw notFound('Supplier not found');
        }
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'supplier.deleted',
          resourceType: 'supplier',
          resourceId: supplierId,
          metadata: { name: current.name },
        });
        return { id: supplierId, deleted: true };
      });
    },

    async postOpeningBalance(organizationId, supplierId, body, actor, idempotencyKey, options = {}) {
      if (!ledgersService) {
        throw validationFailed('Ledger service is not configured');
      }
      const input = parseSupplierOpeningBalance(body);
      if (typeof deps.capabilityService?.assertSupplierOpeningBalanceAllowed === 'function') {
        await deps.capabilityService.assertSupplierOpeningBalanceAllowed(organizationId);
      }

      const postWork = async (session) => {
            const current = await store.findSupplierById(organizationId, supplierId);
            if (current === null) {
              throw notFound('Supplier not found');
            }
            if (current.status !== 'active') {
              throw validationFailed('Opening balance requires an active supplier', [
                { field: 'status', message: 'supplier must be active' },
              ]);
            }
            if (current.openingBalance && current.openingBalance.status === 'posted') {
              throw conflict('Supplier opening balance already posted');
            }

            const postedAt = now();
            const effectKind = input.kind === 'payable' ? 'payable' : 'supplier_advance';
            const sourceType =
              input.kind === 'payable'
                ? 'supplier_opening_payable'
                : 'supplier_opening_advance';

            const effect = await ledgersService.postLedgerEffect(session, {
              organizationId,
              partyType: 'supplier',
              supplierId,
              effectKind,
              signedAmountMinorUnits: input.amountMinorUnits,
              currency: input.currency,
              sourceType,
              sourceId: supplierId,
              postedAt,
              postedBy: actor.actorId,
            });

            const updated = await store.updateSupplier(session, organizationId, supplierId, {
              openingBalance: {
                kind: input.kind,
                amountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                postedAt,
                postedBy: actor.actorId,
                ledgerEffectId: effect['_id'],
                status: 'posted',
              },
              version: Number(current['version']) + 1,
            });

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'supplier.opening_balance.posted',
              resourceType: 'supplier',
              resourceId: supplierId,
              metadata: {
                kind: input.kind,
                amountMinorUnits: input.amountMinorUnits,
                ledgerEffectId: String(effect['_id']),
              },
            });

            const zero = { amount: '0.00', currency: 'PKR' };
            const postedMoney = {
              amount: formatMoneyMinorUnits(BigInt(input.amountMinorUnits)),
              currency: 'PKR',
            };
            const derivedBalances =
              input.kind === 'payable'
                ? { payable: postedMoney, advance: zero }
                : { payable: zero, advance: postedMoney };
            return toSupplierDto(updated, derivedBalances);
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
          operation: 'suppliers.opening-balance.post',
        },
        key,
        { supplierId, kind: input.kind, amountMinorUnits: input.amountMinorUnits },
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

    async countSuppliersWithOpening(organizationId) {
      return store.countSuppliersWithOpening(organizationId);
    },

    async countSuppliers(organizationId) {
      return store.countSuppliers(organizationId);
    },
  };
}

function createSuppliersModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseSuppliersStore()
      : createInMemorySuppliersStore());

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

  const suppliersService = createSuppliersService({
    store,
    transactionRunner,
    idempotency,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
    ...(options.ledgersService === undefined ? {} : { ledgersService: options.ledgersService }),
    ...(options.capabilityService === undefined
      ? {}
      : { capabilityService: options.capabilityService }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.listSupplierReferences === undefined
      ? {}
      : { listSupplierReferences: options.listSupplierReferences }),
  });

  return { store, suppliersService };
}

module.exports = {
  createSuppliersService,
  createSuppliersModule,
  createInMemorySuppliersStore,
  createMongooseSuppliersStore,
};
