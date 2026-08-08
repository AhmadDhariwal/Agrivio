const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createInMemoryOnboardingStore } = require('./onboarding.memory-store');
const {
  createMongooseOnboardingStore,
  createMongooseTransactionSessionPort,
} = require('./onboarding.mongoose-store');
const { createOnboardingService } = require('./onboarding.service');
const { registerOnboardingRoutes } = require('./onboarding.routes');

function createOnboardingModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose'
      ? createMongooseOnboardingStore()
      : createInMemoryOnboardingStore());

  const sessionPort =
    persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port;

  const transactionRunner = createTransactionRunner(sessionPort);
  const onboardingService = createOnboardingService({
    store,
    transactionRunner,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    store,
    onboardingService,
    routes: registerOnboardingRoutes({
      config: options.config,
      onboardingService,
      ...(options.requireCsrf === undefined ? {} : { requireCsrf: options.requireCsrf }),
      ...(options.optionalAuth === undefined ? {} : { optionalAuth: options.optionalAuth }),
    }),
  };
}

module.exports = {
  createOnboardingModule,
};
