const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  parseAccountCreate,
  parseAccountPatch,
  toAccountDto,
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

function createAccountsService(deps) {
  const store = deps.store;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  return {
    async listAccounts(organizationId) {
      const items = await store.listAccounts(organizationId);
      return { items: items.map(toAccountDto) };
    },

    async getAccount(organizationId, accountId) {
      const record = await store.findAccountById(organizationId, accountId);
      if (record === null) {
        throw notFound('Account not found');
      }
      return toAccountDto(record);
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
  const accountsService = createAccountsService({
    store,
    transactionRunner,
  });

  return { store, accountsService };
}

module.exports = {
  createAccountsService,
  createAccountsModule,
  createInMemoryAccountsStore,
  createMongooseAccountsStore,
};
