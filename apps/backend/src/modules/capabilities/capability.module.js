const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const {
  createInMemoryCapabilityPolicyStore,
  createMongooseCapabilityPolicyStore,
} = require('./capability.store');
const { createCapabilityService } = require('./capability.service');

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

function createCapabilityModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseCapabilityPolicyStore()
      : createInMemoryCapabilityPolicyStore());
  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);
  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const capabilityService = createCapabilityService({
    store,
    transactionRunner,
    auditStore: options.auditStore,
    resolveSubscriptionAccessState: options.resolveSubscriptionAccessState,
  });

  return { store, capabilityService };
}

module.exports = {
  createCapabilityModule,
  createInMemoryCapabilityPolicyStore,
  createMongooseCapabilityPolicyStore,
};
