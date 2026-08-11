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
const { createCatalogModule } = require('./modules/catalog/catalog.module');
const { registerCatalogRoutes } = require('./modules/catalog/routes/catalog.routes');
const { createCustomersModule } = require('./modules/customers/customers.module');
const { registerCustomersRoutes } = require('./modules/customers/routes/customers.routes');
const { createSuppliersModule } = require('./modules/suppliers/suppliers.module');
const { registerSuppliersRoutes } = require('./modules/suppliers/routes/suppliers.routes');
const { createAccountsModule } = require('./modules/accounts-expenses/accounts.module');
const { registerAccountsRoutes } = require('./modules/accounts-expenses/routes/accounts.routes');
const { createLedgersModule } = require('./modules/payments-ledgers/ledgers.module');
const { createInventoryModule } = require('./modules/inventory/inventory.module');
const { registerInventoryRoutes } = require('./modules/inventory/routes/inventory.routes');
const { createSetupProgressService } = require('./modules/settings/setup-progress.service');
const { canAccessWarehouse } = require('./modules/identity/assignment-scope');

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

  const catalog =
    options.catalog ??
    createCatalogModule({
      persistence,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const ledgers =
    options.ledgers ??
    createLedgersModule({
      persistence,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const customers =
    options.customers ??
    createCustomersModule({
      persistence,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      ledgersService: options.ledgersService ?? ledgers.ledgersService,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const suppliers =
    options.suppliers ??
    createSuppliersModule({
      persistence,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      ledgersService: options.ledgersService ?? ledgers.ledgersService,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const accounts =
    options.accounts ??
    createAccountsModule({
      persistence,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const inventory =
    options.inventory ??
    createInventoryModule({
      persistence,
      catalogService: catalog.catalogService,
      locationsService: locations.locationsService,
      canAccessWarehouse,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const setupProgressService =
    options.setupProgressService ??
    createSetupProgressService({
      findOrganizationById: (id) => onboardingCore.store.findOrganizationById(id),
      findSettingsByOrganizationId: (organizationId) =>
        settings.store.findByOrganizationId(organizationId),
      countBranches: (organizationId) => locations.store.countBranches(organizationId),
      countWarehouses: (organizationId) => locations.store.countWarehouses(organizationId),
      countActiveMemberships: async (organizationId) => {
        const memberships = await employees.store.listMembershipsByOrganizationId(organizationId);
        return memberships.filter((item) => item.status === 'active').length;
      },
      countCategories: (organizationId) => catalog.store.countCategories(organizationId),
      countProducts: (organizationId) => catalog.store.countProducts(organizationId),
      countPackagingUnits: (organizationId) => catalog.store.countPackagingUnits(organizationId),
      countProductPrices: (organizationId) => catalog.store.countProductPrices(organizationId),
      countCustomers: (organizationId) => customers.store.countCustomers(organizationId),
      countSuppliers: (organizationId) => suppliers.store.countSuppliers(organizationId),
      countAccounts: (organizationId) => accounts.store.countAccounts(organizationId),
      countCustomersWithOpening: (organizationId) =>
        customers.store.countCustomersWithOpening(organizationId),
      countSuppliersWithOpening: (organizationId) =>
        suppliers.store.countSuppliersWithOpening(organizationId),
      countAccountsWithOpening: (organizationId) =>
        accounts.store.countAccountsWithOpening(organizationId),
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
    setupProgressService,
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

  const catalogRoutes = registerCatalogRoutes({
    catalogService: catalog.catalogService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const customersRoutes = registerCustomersRoutes({
    customersService: customers.customersService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const suppliersRoutes = registerSuppliersRoutes({
    suppliersService: suppliers.suppliersService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const accountsRoutes = registerAccountsRoutes({
    accountsService: accounts.accountsService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const inventoryRoutes = registerInventoryRoutes({
    inventoryService: inventory.inventoryService,
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
  app.use(catalogRoutes);
  app.use(customersRoutes);
  app.use(suppliersRoutes);
  app.use(accountsRoutes);
  app.use(inventoryRoutes);

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
    catalog,
    customers,
    suppliers,
    accounts,
    inventory,
    ledgers,
    setupProgressService,
  };

  return app;
}

module.exports = {
  createApp,
};
