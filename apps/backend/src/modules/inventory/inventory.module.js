const mongoose = require('mongoose');
const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { createInventoryService } = require('./inventory.service');
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
    hasPermission: options.hasPermission,
    resolveOrganizationTimezone: options.resolveOrganizationTimezone,
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
