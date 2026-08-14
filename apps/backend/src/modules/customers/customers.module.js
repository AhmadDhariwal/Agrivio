const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
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
  parseCustomerCreate,
  parseCustomerPatch,
  parseCreditPolicyPatch,
  parseCustomerOpeningBalance,
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

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function createCustomersService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const ledgersService = deps.ledgersService;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: async (session, event) => {
      await store.appendAuditEvent(session, event);
      if (deps.auditStore) {
        await deps.auditStore.append(session, event);
      }
    },
  });
  const transactionRunner = deps.transactionRunner;

  async function buildCustomerDto(organizationId, record) {
    if (!ledgersService) {
      return toCustomerDto(record);
    }
    const customerId = String(record['_id']);
    const [receivable, advance] = await Promise.all([
      ledgersService.sumCustomerReceivable(organizationId, customerId),
      ledgersService.sumCustomerAdvance(organizationId, customerId),
    ]);
    return toCustomerDto(record, { receivable, advance });
  }

  return {
    async listCustomers(organizationId) {
      const items = await store.listCustomers(organizationId);
      if (!ledgersService || typeof ledgersService.mapPartyBalances !== 'function') {
        const mapped = [];
        for (const item of items) {
          mapped.push(await buildCustomerDto(organizationId, item));
        }
        return { items: mapped };
      }
      const [receivableMap, advanceMap] = await Promise.all([
        ledgersService.mapPartyBalances(organizationId, 'customer', 'receivable'),
        ledgersService.mapPartyBalances(organizationId, 'customer', 'advance'),
      ]);
      const zero = { amount: '0.00', currency: 'PKR' };
      return {
        items: items.map((item) =>
          toCustomerDto(item, {
            receivable: receivableMap.get(String(item['_id'])) ?? zero,
            advance: advanceMap.get(String(item['_id'])) ?? zero,
          }),
        ),
      };
    },

    async getCustomer(organizationId, customerId) {
      const record = await store.findCustomerById(organizationId, customerId);
      if (record === null) {
        throw notFound('Customer not found');
      }
      return buildCustomerDto(organizationId, record);
    },

    async findCustomerByName(organizationId, name) {
      const needle = String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return null;
      }
      const items = await store.listCustomers(organizationId);
      const found = items.find((item) => String(item.nameNormalized) === needle);
      return found ? toCustomerDto(found) : null;
    },

    async createCustomer(organizationId, body, actor, options = {}) {
      const input = parseCustomerCreate(body);
      const currentUsage = await store.countCustomers(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'customers',
        currentUsage,
      );

      try {
        return await transactionRunner.runWithOptionalSession(options.session, async (session) => {
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
          return attachSoftWarning(toCustomerDto(created), entitlement);
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

    async postOpeningBalance(organizationId, customerId, body, actor, idempotencyKey, options = {}) {
      if (!ledgersService) {
        throw validationFailed('Ledger service is not configured');
      }
      const input = parseCustomerOpeningBalance(body);

      const postWork = async (session) => {
            const current = await store.findCustomerById(organizationId, customerId);
            if (current === null) {
              throw notFound('Customer not found');
            }
            if (current.status !== 'active') {
              throw validationFailed('Opening balance requires an active customer', [
                { field: 'status', message: 'customer must be active' },
              ]);
            }
            if (current.openingBalance && current.openingBalance.status === 'posted') {
              throw conflict('Customer opening balance already posted');
            }

            const postedAt = now();
            const effectKind = input.kind === 'receivable' ? 'receivable' : 'advance';
            const sourceType =
              input.kind === 'receivable'
                ? 'customer_opening_receivable'
                : 'customer_opening_advance';

            const effect = await ledgersService.postLedgerEffect(session, {
              organizationId,
              partyType: 'customer',
              customerId,
              effectKind,
              signedAmountMinorUnits: input.amountMinorUnits,
              currency: input.currency,
              sourceType,
              sourceId: customerId,
              postedAt,
              postedBy: actor.actorId,
            });

            const updated = await store.updateCustomer(session, organizationId, customerId, {
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
              action: 'customer.opening_balance.posted',
              resourceType: 'customer',
              resourceId: customerId,
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
              input.kind === 'receivable'
                ? { receivable: postedMoney, advance: zero }
                : { receivable: zero, advance: postedMoney };
            return toCustomerDto(updated, derivedBalances);
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
          operation: 'customers.opening-balance.post',
        },
        key,
        { customerId, kind: input.kind, amountMinorUnits: input.amountMinorUnits },
        async () => {
          const dto = await transactionRunner.run(postWork);
          return { statusCode: 201, body: dto };
        },
      );

      return { replay: result.replay, data: result.response.body, statusCode: result.response.statusCode };
    },

    async countCustomersWithOpening(organizationId) {
      return store.countCustomersWithOpening(organizationId);
    },

    async countCustomers(organizationId) {
      return store.countCustomers(organizationId);
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
  const idempotencyStore =
    options.idempotencyStore ??
    (persistence === 'mongoose'
      ? createMongooseIdempotencyStore()
      : createInMemoryIdempotencyStore());
  const idempotency = options.idempotency ?? createIdempotencyService(idempotencyStore);

  const customersService = createCustomersService({
    store,
    transactionRunner,
    idempotency,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
    ...(options.ledgersService === undefined ? {} : { ledgersService: options.ledgersService }),
    ...(options.auditStore === undefined ? {} : { auditStore: options.auditStore }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, customersService };
}

module.exports = {
  createCustomersService,
  createCustomersModule,
  createInMemoryCustomersStore,
  createMongooseCustomersStore,
};
