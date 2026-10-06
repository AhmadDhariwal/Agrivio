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
const { registerOnboardingRoutes } = require('./routes/onboarding.routes');
const {
  createOnboardingRateLimiter,
  resolveOnboardingRateLimiterOptions,
} = require('./onboarding.rate-limit');

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
    persistence,
    publicWebBaseUrl: options.config?.publicWebBaseUrl ?? 'http://localhost:4200',
    ...(options.subscriptionStore === undefined
      ? {}
      : { subscriptionStore: options.subscriptionStore }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const onboardingRateLimiter =
    options.onboardingRateLimiter ??
    createOnboardingRateLimiter({
      ...resolveOnboardingRateLimiterOptions(options.config?.nodeEnv),
      persistence,
      ...(options.now === undefined ? {} : { now: () => options.now().getTime() }),
    });

  return {
    store,
    onboardingService,
    onboardingRateLimiter,
    routes: registerOnboardingRoutes({
      config: options.config,
      onboardingService,
      ...(options.requireCsrf === undefined ? {} : { requireCsrf: options.requireCsrf }),
      ...(options.optionalAuth === undefined ? {} : { optionalAuth: options.optionalAuth }),
      onboardingRateLimiter,
    }),
  };
}

module.exports = {
  createOnboardingModule,
};
