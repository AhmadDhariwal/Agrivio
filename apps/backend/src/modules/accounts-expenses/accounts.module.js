const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const {
  parseAccountCreate,
  parseAccountPatch,
  parseAccountOpeningBalance,
  toAccountDto,
  toAccountMovementDto,
} = require('./accounts.validation');
const {
  createInMemoryAccountsStore,
  createMongooseAccountsStore,
} = require('./accounts.store');

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

function createAccountsService(deps) {
  const store = deps.store;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function buildAccountDto(organizationId, record) {
    const balance = await sumAccountBalanceInternal(organizationId, String(record['_id']));
    return toAccountDto(record, { balance });
  }

  async function sumAccountBalanceInternal(organizationId, accountId) {
    const minor = await store.sumPostedMovements(organizationId, accountId);
    return {
      amount: formatMoneyMinorUnits(BigInt(String(minor ?? '0'))),
      currency: 'PKR',
    };
  }

  return {
    async listAccounts(organizationId) {
      const items = await store.listAccounts(organizationId);
      const mapped = [];
      for (const item of items) {
        mapped.push(await buildAccountDto(organizationId, item));
      }
      return { items: mapped };
    },

    async getAccount(organizationId, accountId) {
      const record = await store.findAccountById(organizationId, accountId);
      if (record === null) {
        throw notFound('Account not found');
      }
      return buildAccountDto(organizationId, record);
    },

    async createAccount(organizationId, body, actor) {
      const input = parseAccountCreate(body);
      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertAccount(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'account.created',
            resourceType: 'account',
            resourceId: String(created['_id']),
            metadata: { accountType: created.accountType },
          });
          return toAccountDto(created);
        });
      } catch (error) {
        mapDuplicate(error, 'Account name already exists in this organization');
      }
    },

    async updateAccount(organizationId, accountId, body, actor) {
      const { expectedVersion, patch } = parseAccountPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findAccountById(organizationId, accountId);
          if (current === null) {
            throw notFound('Account not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          if (current.accountType === 'bank' && patch.bankName === '') {
            throw validationFailed('bankName is required for bank accounts', [
              { field: 'bankName', message: 'bankName is required for bank accounts' },
            ]);
          }
          if (
            (current.accountType === 'jazzcash' || current.accountType === 'easypaisa') &&
            patch.walletIdentifier === ''
          ) {
            throw validationFailed('walletIdentifier is required for wallet accounts', [
              { field: 'walletIdentifier', message: 'walletIdentifier is required' },
            ]);
          }
          const updated = await store.updateAccount(session, organizationId, accountId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'account.updated',
            resourceType: 'account',
            resourceId: accountId,
            metadata: { fields: Object.keys(patch) },
          });
          return toAccountDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Account name already exists in this organization');
      }
    },

    /**
     * Public Accounts interface: post a signed account movement within a session.
     */
    async postAccountMovement(session, input) {
      try {
        return await store.insertAccountMovement(session, {
          organizationId: input.organizationId,
          accountId: input.accountId,
          signedAmountMinorUnits: String(input.signedAmountMinorUnits),
          currency: input.currency ?? 'PKR',
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          status: 'posted',
          postedAt: input.postedAt,
          postedBy: input.postedBy,
        });
      } catch (error) {
        mapDuplicate(error, 'Opening account movement already exists for this account');
      }
    },

    async sumAccountBalance(organizationId, accountId) {
      return sumAccountBalanceInternal(organizationId, accountId);
    },

    async listAccountMovements(organizationId, accountId) {
      const account = await store.findAccountById(organizationId, accountId);
      if (account === null) {
        throw notFound('Account not found');
      }
      const items = await store.listMovementsByAccount(organizationId, accountId);
      return { items: items.map(toAccountMovementDto) };
    },

    async postOpeningBalance(organizationId, accountId, body, actor, idempotencyKey) {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = parseAccountOpeningBalance(body);

      const result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'accounts.opening-balance.post',
        },
        key,
        { accountId, amountMinorUnits: input.amountMinorUnits },
        async () => {
          const dto = await transactionRunner.run(async (session) => {
            const current = await store.findAccountById(organizationId, accountId);
            if (current === null) {
              throw notFound('Account not found');
            }
            if (current.status !== 'active') {
              throw validationFailed('Opening balance requires an active account', [
                { field: 'status', message: 'account must be active' },
              ]);
            }
            if (current.openingBalance && current.openingBalance.status === 'posted') {
              throw conflict('Account opening balance already posted');
            }

            const postedAt = now();
            let movement;
            try {
              movement = await store.insertAccountMovement(session, {
                organizationId,
                accountId,
                signedAmountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                sourceType: 'account_opening',
                sourceId: accountId,
                status: 'posted',
                postedAt,
                postedBy: actor.actorId,
              });
            } catch (error) {
              mapDuplicate(error, 'Opening account movement already exists for this account');
            }

            const updated = await store.updateAccount(session, organizationId, accountId, {
              openingBalance: {
                kind: 'balance',
                amountMinorUnits: input.amountMinorUnits,
                currency: input.currency,
                postedAt,
                postedBy: actor.actorId,
                accountMovementId: movement['_id'],
                status: 'posted',
              },
              version: Number(current['version']) + 1,
            });

            await auditWriter.appendBusinessEvent(session, {
              organizationId,
              actorId: actor.actorId,
              action: 'account.opening_balance.posted',
              resourceType: 'account',
              resourceId: accountId,
              metadata: {
                amountMinorUnits: input.amountMinorUnits,
                accountMovementId: String(movement['_id']),
              },
            });

            return toAccountDto(updated, {
              balance: {
                amount: formatMoneyMinorUnits(BigInt(input.amountMinorUnits)),
                currency: 'PKR',
              },
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

    async countAccounts(organizationId) {
      return store.countAccounts(organizationId);
    },

    async countAccountsWithOpening(organizationId) {
      return store.countAccountsWithOpening(organizationId);
    },
  };
}

function createAccountsModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAccountsStore() : createInMemoryAccountsStore());

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

  const accountsService = createAccountsService({
    store,
    transactionRunner,
    idempotency,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, accountsService };
}

module.exports = {
  createAccountsService,
  createAccountsModule,
  createInMemoryAccountsStore,
  createMongooseAccountsStore,
};
