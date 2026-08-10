const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, forbidden, notFound } = require('../../platform/errors/app-error');
const {
  parseSupplierCreate,
  parseSupplierPatch,
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

function createSuppliersService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function assertCreationLimit(organizationId, limitKey, currentUsage) {
    if (typeof evaluateEntitlement !== 'function') {
      return;
    }
    const result = await evaluateEntitlement(organizationId, {
      label: 'operational+limit',
      limitKey,
      currentUsage,
    });
    if (!result.allowed && result.reason === 'limit_reached') {
      throw forbidden(`Plan limit reached for ${limitKey}`, [
        { limitKey, reason: result.reason, ...(result.limit ?? {}) },
      ]);
    }
    return result;
  }

  return {
    async listSuppliers(organizationId) {
      const items = await store.listSuppliers(organizationId);
      return { items: items.map(toSupplierDto) };
    },

    async getSupplier(organizationId, supplierId) {
      const record = await store.findSupplierById(organizationId, supplierId);
      if (record === null) {
        throw notFound('Supplier not found');
      }
      return toSupplierDto(record);
    },

    async createSupplier(organizationId, body, actor) {
      const input = parseSupplierCreate(body);
      const currentUsage = await store.countSuppliers(organizationId);
      const entitlement = await assertCreationLimit(organizationId, 'suppliers', currentUsage);

      try {
        return await transactionRunner.run(async (session) => {
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
          const dto = toSupplierDto(created);
          if (entitlement?.limit?.softWarning === true) {
            return { ...dto, softWarning: entitlement.limit };
          }
          return dto;
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
  const suppliersService = createSuppliersService({
    store,
    transactionRunner,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
  });

  return { store, suppliersService };
}

module.exports = {
  createSuppliersService,
  createSuppliersModule,
  createInMemorySuppliersStore,
  createMongooseSuppliersStore,
};
