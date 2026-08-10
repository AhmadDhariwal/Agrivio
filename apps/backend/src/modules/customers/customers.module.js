const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, forbidden, notFound } = require('../../platform/errors/app-error');
const {
  parseCustomerCreate,
  parseCustomerPatch,
  parseCreditPolicyPatch,
  assertWalkInCreditPolicy,
  toCustomerDto,
} = require('./customers.validation');
const {
  createInMemoryCustomersStore,
  createMongooseCustomersStore,
} = require('./customers.store');

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

function createCustomersService(deps) {
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
    async listCustomers(organizationId) {
      const items = await store.listCustomers(organizationId);
      return { items: items.map(toCustomerDto) };
    },

    async getCustomer(organizationId, customerId) {
      const record = await store.findCustomerById(organizationId, customerId);
      if (record === null) {
        throw notFound('Customer not found');
      }
      return toCustomerDto(record);
    },

    async createCustomer(organizationId, body, actor) {
      const input = parseCustomerCreate(body);
      const currentUsage = await store.countCustomers(organizationId);
      const entitlement = await assertCreationLimit(organizationId, 'customers', currentUsage);

      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertCustomer(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'customer.created',
            resourceType: 'customer',
            resourceId: String(created['_id']),
            metadata: {
              customerType: created.customerType,
              priceTier: created.priceTier,
              creditEnabled: created.creditEnabled,
            },
          });
          const dto = toCustomerDto(created);
          if (entitlement?.limit?.softWarning === true) {
            return { ...dto, softWarning: entitlement.limit };
          }
          return dto;
        });
      } catch (error) {
        mapDuplicate(error, 'Customer already exists in this organization');
      }
    },

    async updateCustomer(organizationId, customerId, body, actor) {
      const { expectedVersion, patch } = parseCustomerPatch(body);
      return transactionRunner.run(async (session) => {
        const current = await store.findCustomerById(organizationId, customerId);
        if (current === null) {
          throw notFound('Customer not found');
        }
        assertOptimisticVersion(current, expectedVersion);
        const nextType = patch.customerType ?? current.customerType;
        const nextName = patch.name ?? current.name;
        const nextPhone = patch.phone ?? current.phone;
        assertWalkInCreditPolicy(nextType, current.creditEnabled, nextName, nextPhone);
        const updated = await store.updateCustomer(session, organizationId, customerId, {
          ...patch,
          version: Number(current['version']) + 1,
        });
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'customer.updated',
          resourceType: 'customer',
          resourceId: customerId,
          metadata: { fields: Object.keys(patch) },
        });
        return toCustomerDto(updated);
      });
    },

    async updateCreditPolicy(organizationId, customerId, body, actor) {
      const { expectedVersion, patch } = parseCreditPolicyPatch(body);
      return transactionRunner.run(async (session) => {
        const current = await store.findCustomerById(organizationId, customerId);
        if (current === null) {
          throw notFound('Customer not found');
        }
        assertOptimisticVersion(current, expectedVersion);
        const nextEnabled =
          patch.creditEnabled === undefined ? current.creditEnabled : patch.creditEnabled;
        assertWalkInCreditPolicy(
          current.customerType,
          nextEnabled,
          current.name,
          current.phone,
        );
        const updated = await store.updateCustomer(session, organizationId, customerId, {
          ...patch,
          version: Number(current['version']) + 1,
        });
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'customer.credit_policy.updated',
          resourceType: 'customer',
          resourceId: customerId,
          metadata: {
            creditEnabled: updated.creditEnabled,
            creditLimitBehaviour: updated.creditLimitBehaviour,
          },
        });
        return toCustomerDto(updated);
      });
    },
  };
}

function createCustomersModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseCustomersStore()
      : createInMemoryCustomersStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const customersService = createCustomersService({
    store,
    transactionRunner,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
  });

  return { store, customersService };
}

module.exports = {
  createCustomersService,
  createCustomersModule,
  createInMemoryCustomersStore,
  createMongooseCustomersStore,
};
