const express = require('express');
const {
  createErrorHandlerMiddleware,
  createNotFoundMiddleware,
} = require('./platform/errors/error-handler.middleware');
const { registerHealthRoutes } = require('./platform/health/health.routes');
const { createRequestIdMiddleware } = require('./platform/http/request-id.middleware');
const { createStructuredLogger } = require('./platform/logging/structured-logger');
const { createOnboardingModule } = require('./modules/onboarding/onboarding.module');
const { registerOnboardingRoutes } = require('./modules/onboarding/onboarding.routes');
const { createAuthModule } = require('./modules/identity/auth.module');
const { createBridgedAuthStore } = require('./modules/identity/auth.bridge-store');
const { createMongooseAuthStore } = require('./modules/identity/auth.mongoose-store');
const { registerOrganizationRoutes } = require('./modules/organizations/organization.routes');
const { createSubscriptionModule } = require('./modules/subscriptions/subscription.module');
const { registerSubscriptionRoutes } = require('./modules/subscriptions/subscription.routes');
const { createInMemorySubscriptionStore } = require('./modules/subscriptions/subscription.memory-store');
const {
  createMongooseSubscriptionStore,
} = require('./modules/subscriptions/subscription.mongoose-store');

function createApp(options) {
  const { config, database } = options;
  const logger = options.logger ?? createStructuredLogger({ service: 'backend' });
  const persistence =
    options.onboardingPersistence ?? (config.nodeEnv === 'test' ? 'memory' : 'mongoose');
  const authPersistence = options.authPersistence ?? persistence;
  const subscriptionPersistence = options.subscriptionPersistence ?? persistence;

  const sharedSubscriptionStore =
    options.subscriptionStore ??
    options.subscriptions?.store ??
    (subscriptionPersistence === 'mongoose'
      ? createMongooseSubscriptionStore()
      : createInMemorySubscriptionStore());

  const subscriptions =
    options.subscriptions ??
    createSubscriptionModule({
      config,
      persistence: subscriptionPersistence,
      store: sharedSubscriptionStore,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const onboardingCore =
    options.onboarding ??
    createOnboardingModule({
      config,
      persistence,
      subscriptionStore: sharedSubscriptionStore,
    });

  onboardingCore.onboardingService.setSubscriptionStore(sharedSubscriptionStore);
  onboardingCore.onboardingService.setSubscriptionBridge({
    resolveTrialPlanReference: (planCode) =>
      subscriptions.subscriptionService.resolveTrialPlanReference(planCode),
    markReferencedPlan: (planCode, planVersion, session, at) =>
      subscriptions.subscriptionService.markReferencedPlan(planCode, planVersion, session, at),
  });

  const auth =
    options.auth ??
    createAuthModule({
      config,
      persistence: authPersistence,
      store:
        authPersistence === 'mongoose'
          ? createMongooseAuthStore()
          : createBridgedAuthStore({ identityStore: onboardingCore.store }),
      onboardingService: onboardingCore.onboardingService,
      resolveSubscriptionAccessState: (organizationId) =>
        subscriptions.subscriptionService.resolveAccessState(organizationId),
    });

  const onboardingRoutes = registerOnboardingRoutes({
    config,
    onboardingService: onboardingCore.onboardingService,
    requireCsrf: auth.middlewares.requireCsrf,
    optionalAuth: auth.middlewares.optionalAuth,
  });

  const organizationRoutes = registerOrganizationRoutes({
    requireAuth: auth.middlewares.requireAuth,
    findOrganizationById: (id) => onboardingCore.store.findOrganizationById(id),
    requireBillingAccess: subscriptions.middlewares.requireBillingAccess,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const subscriptionRoutes = registerSubscriptionRoutes({
    config,
    subscriptionService: subscriptions.subscriptionService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    optionalAuth: auth.middlewares.optionalAuth,
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(createRequestIdMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(auth.middlewares.originGuard);
  app.use(auth.middlewares.authTransport);

  app.use(registerHealthRoutes({ database }));
  app.use(auth.routes);
  app.use(onboardingRoutes);
  app.use(organizationRoutes);
  app.use(subscriptionRoutes);

  if (typeof options.registerOperationalProbe === 'function') {
    options.registerOperationalProbe(app, {
      requireAuth: auth.middlewares.requireAuth,
      requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
      requirePermission: auth.middlewares.requirePermission,
      requireOrganizationContext: auth.middlewares.requireOrganizationContext,
    });
  }

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  app.agrivio = {
    onboarding: onboardingCore,
    subscriptions,
    auth,
  };

  return app;
}

module.exports = {
  createApp,
};
