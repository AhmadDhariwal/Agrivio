const express = require('express');
const {
  createErrorHandlerMiddleware,
  createNotFoundMiddleware,
} = require('./platform/errors/error-handler.middleware');
const { registerHealthRoutes } = require('./platform/health/health.routes');
const { createRequestIdMiddleware } = require('./platform/http/request-id.middleware');
const { createStructuredLogger } = require('./platform/logging/structured-logger');
const { createOnboardingModule } = require('./modules/onboarding/onboarding.module');
const { registerOnboardingRoutes } = require('./modules/onboarding/routes/onboarding.routes');
const { createAuthModule } = require('./modules/identity/auth.module');
const { createBridgedAuthStore } = require('./modules/identity/auth.bridge-store');
const { createMongooseAuthStore } = require('./modules/identity/auth.mongoose-store');
const { registerOrganizationRoutes } = require('./modules/organizations/routes/organization.routes');
const { createSubscriptionModule } = require('./modules/subscriptions/subscription.module');
const { registerSubscriptionRoutes } = require('./modules/subscriptions/routes/subscription.routes');
const { createInMemorySubscriptionStore } = require('./modules/subscriptions/subscription.memory-store');
const {
  createMongooseSubscriptionStore,
} = require('./modules/subscriptions/subscription.mongoose-store');
const { createSettingsModule } = require('./modules/settings/settings.module');
const { registerSettingsRoutes } = require('./modules/settings/routes/settings.routes');
const {
  createLocationsModule,
  createInMemoryLocationsStore,
  createMongooseLocationsStore,
} = require('./modules/locations/locations.module');
const { registerLocationsRoutes } = require('./modules/locations/routes/locations.routes');
const {
  createEmployeesModule,
  createMongooseEmployeesStore,
} = require('./modules/identity/employees.module');
const { createBridgedEmployeesStore } = require('./modules/identity/employees.bridge-store');
const { registerEmployeesRoutes } = require('./modules/identity/routes/employees.routes');

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

  const locationsStore =
    options.locationsStore ??
    (persistence === 'mongoose' ? createMongooseLocationsStore() : createInMemoryLocationsStore());

  const auth =
    options.auth ??
    createAuthModule({
      config,
      persistence: authPersistence,
      store:
        authPersistence === 'mongoose'
          ? createMongooseAuthStore()
          : createBridgedAuthStore({
              identityStore: onboardingCore.store,
              locationsStore,
            }),
      onboardingService: onboardingCore.onboardingService,
      resolveSubscriptionAccessState: (organizationId) =>
        subscriptions.subscriptionService.resolveAccessState(organizationId),
    });

  const settings =
    options.settings ??
    createSettingsModule({
      persistence,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const employeesStore =
    options.employeesStore ??
    (persistence === 'mongoose'
      ? createMongooseEmployeesStore()
      : createBridgedEmployeesStore({
          identityStore: onboardingCore.store,
          authStore: auth.store,
          locationsStore,
        }));

  const employees =
    options.employees ??
    createEmployeesModule({
      persistence,
      store: employeesStore,
      publicWebBaseUrl: config.publicWebBaseUrl,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const locations =
    options.locations ??
    createLocationsModule({
      persistence,
      store: locationsStore,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      findMembershipInOrganization: (organizationId, userId) =>
        employees.employeesService.findMembershipInOrganization(organizationId, userId),
      revokeSessionsForUser: (session, userId, revokedAt) =>
        auth.store.revokeAllSessionsForUser(session, userId, revokedAt),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const onboardingRoutes = registerOnboardingRoutes({
    config,
    onboardingService: onboardingCore.onboardingService,
    requireCsrf: auth.middlewares.requireCsrf,
    optionalAuth: auth.middlewares.optionalAuth,
  });

  const organizationRoutes = registerOrganizationRoutes({
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    findOrganizationById: (id) => onboardingCore.store.findOrganizationById(id),
    updateOrganization: async (id, patch) => onboardingCore.store.updateOrganization(null, id, patch),
    appendOrganizationAudit: async (event) => {
      await onboardingCore.store.appendAuditEvent(null, {
        ...event,
        occurredAt: new Date().toISOString(),
      });
    },
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

  const settingsRoutes = registerSettingsRoutes({
    settingsService: settings.settingsService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const locationsRoutes = registerLocationsRoutes({
    locationsService: locations.locationsService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const employeesRoutes = registerEmployeesRoutes({
    employeesService: employees.employeesService,
    locationsService: locations.locationsService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(createRequestIdMiddleware());
  app.use(auth.middlewares.cors);
  app.use(express.json({ limit: '1mb' }));
  app.use(auth.middlewares.originGuard);
  app.use(auth.middlewares.authTransport);

  app.use(registerHealthRoutes({ database }));
  app.use(auth.routes);
  app.use(onboardingRoutes);
  app.use(organizationRoutes);
  app.use(subscriptionRoutes);
  app.use(settingsRoutes);
  app.use(locationsRoutes);
  app.use(employeesRoutes);

  if (typeof options.registerOperationalProbe === 'function') {
    options.registerOperationalProbe(app, {
      requireAuth: auth.middlewares.requireAuth,
      requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
      requirePermission: auth.middlewares.requirePermission,
      requireOrganizationContext: auth.middlewares.requireOrganizationContext,
      requireBranchAccess: auth.middlewares.requireBranchAccess,
      requireWarehouseAccess: auth.middlewares.requireWarehouseAccess,
      requireCsrf: auth.middlewares.requireCsrf,
    });
  }

  if (config.allowE2eBootstrap === true) {
    const { registerE2eBootstrapRoutes } = require('./platform/testing/e2e-bootstrap.routes');
    app.use(
      registerE2eBootstrapRoutes({
        config,
        authStore: auth.store,
      }),
    );
  }

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  app.agrivio = {
    onboarding: onboardingCore,
    subscriptions,
    auth,
    settings,
    locations,
    employees,
  };

  return app;
}

module.exports = {
  createApp,
};
