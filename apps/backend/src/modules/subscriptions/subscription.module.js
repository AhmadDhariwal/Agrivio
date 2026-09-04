const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createInMemorySubscriptionStore } = require('./subscription.memory-store');
const {
  createMongooseSubscriptionStore,
  createMongooseTransactionSessionPort,
} = require('./subscription.mongoose-store');
const { createSubscriptionService } = require('./subscription.service');
const { registerSubscriptionRoutes } = require('./routes/subscription.routes');
const { createRequireSubscriptionAccessMiddleware } = require('./entitlement.middleware');
const { createBillingEvidenceStorage } = require('./billing-evidence-storage');

function createSubscriptionModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseSubscriptionStore()
      : createInMemorySubscriptionStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const evidenceStorage =
    options.evidenceStorage ??
    createBillingEvidenceStorage({
      adapter: persistence === 'mongoose' ? 'local' : 'memory',
      rootDir:
        options.config?.billingEvidenceStorageDir ||
        process.env['AGRIVIO_BILLING_EVIDENCE_STORAGE_DIR'] ||
        undefined,
    });

  const subscriptionService = createSubscriptionService({
    store,
    transactionRunner,
    evidenceStorage,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.trialDays === undefined ? {} : { trialDays: options.trialDays }),
    ...(options.graceDays === undefined ? {} : { graceDays: options.graceDays }),
    ...(options.retentionDays === undefined ? {} : { retentionDays: options.retentionDays }),
  });

  return {
    store,
    evidenceStorage,
    subscriptionService,
    middlewares: {
      requireBillingAccess: createRequireSubscriptionAccessMiddleware({
        label: 'billing-access',
        resolveAccessState: (organizationId) =>
          subscriptionService.resolveAccessState(organizationId),
      }),
      requireOperationalAccess: createRequireSubscriptionAccessMiddleware({
        label: 'operational',
        resolveAccessState: (organizationId) =>
          subscriptionService.resolveAccessState(organizationId),
      }),
      requireSuspendedReadAccess: createRequireSubscriptionAccessMiddleware({
        label: 'suspended-read',
        resolveAccessState: (organizationId) =>
          subscriptionService.resolveAccessState(organizationId),
      }),
    },
    routes: registerSubscriptionRoutes({
      config: options.config,
      subscriptionService,
      ...(options.requireAuth === undefined ? {} : { requireAuth: options.requireAuth }),
      ...(options.requireCsrf === undefined ? {} : { requireCsrf: options.requireCsrf }),
      ...(options.optionalAuth === undefined ? {} : { optionalAuth: options.optionalAuth }),
    }),
  };
}

module.exports = {
  createSubscriptionModule,
};
