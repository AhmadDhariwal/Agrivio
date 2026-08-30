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
const {
  registerOrganizationRoutes,
} = require('./modules/organizations/routes/organization.routes');
const { createSubscriptionModule } = require('./modules/subscriptions/subscription.module');
const {
  registerSubscriptionRoutes,
} = require('./modules/subscriptions/routes/subscription.routes');
const {
  createInMemorySubscriptionStore,
} = require('./modules/subscriptions/subscription.memory-store');
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
const {
  createMongooseMasterReferenceQueries,
} = require('./platform/lifecycle/master-reference-queries');
const { registerCatalogRoutes } = require('./modules/catalog/routes/catalog.routes');
const { createCustomersModule } = require('./modules/customers/customers.module');
const { registerCustomersRoutes } = require('./modules/customers/routes/customers.routes');
const { createSuppliersModule } = require('./modules/suppliers/suppliers.module');
const { registerSuppliersRoutes } = require('./modules/suppliers/routes/suppliers.routes');
const { createAccountsModule } = require('./modules/accounts-expenses/accounts.module');
const { registerAccountsRoutes } = require('./modules/accounts-expenses/routes/accounts.routes');
const { registerExpensesRoutes } = require('./modules/accounts-expenses/routes/expenses.routes');
const { createLedgersModule } = require('./modules/payments-ledgers/ledgers.module');
const { registerPaymentsRoutes } = require('./modules/payments-ledgers/routes/payments.routes');
const { createInventoryModule } = require('./modules/inventory/inventory.module');
const { registerInventoryRoutes } = require('./modules/inventory/routes/inventory.routes');
const { createPurchasesModule } = require('./modules/purchases/purchases.module');
const { createSalesModule } = require('./modules/sales/sales.module');
const { createReturnsModule } = require('./modules/returns-corrections/returns.module');
const { registerReturnsRoutes } = require('./modules/returns-corrections/routes/returns.routes');
const { registerPurchasesRoutes } = require('./modules/purchases/routes/purchases.routes');
const { registerSalesRoutes } = require('./modules/sales/routes/sales.routes');
const { createAlertsModule } = require('./modules/alerts/alerts.module');
const { registerAlertsRoutes } = require('./modules/alerts/routes/alerts.routes');
const { createReportingModule } = require('./modules/reporting/reporting.module');
const { registerReportingRoutes } = require('./modules/reporting/routes/reporting.routes');
const { createImportsModule } = require('./modules/imports/imports.module');
const { registerImportsRoutes } = require('./modules/imports/routes/imports.routes');
const { createAuditModule } = require('./modules/audit/audit.module');
const { registerAuditRoutes } = require('./modules/audit/routes/audit.routes');
const { createCapabilityModule } = require('./modules/capabilities/capability.module');
const { registerCapabilityRoutes } = require('./modules/capabilities/routes/capability.routes');
const { createOperationsModule } = require('./modules/operations/operations.module');
const { registerOperationsRoutes } = require('./modules/operations/routes/operations.routes');
const { createSetupProgressService } = require('./modules/settings/setup-progress.service');
const { canAccessBranch, canAccessWarehouse } = require('./modules/identity/assignment-scope');
const { hasPermission } = require('./modules/identity/role-permissions');

function createApp(options) {
  const { config, database } = options;
  const logger = options.logger ?? createStructuredLogger({ service: 'backend' });
  const persistence =
    options.onboardingPersistence ?? (config.nodeEnv === 'test' ? 'memory' : 'mongoose');
  const masterRefs = persistence === 'mongoose' ? createMongooseMasterReferenceQueries() : null;
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
    getOrganizationSubscription: (organizationId) =>
      subscriptions.subscriptionService.getOrganizationSubscription(organizationId),
    suspendSubscription: (subscriptionId, body, actor) =>
      subscriptions.subscriptionService.suspendSubscription(subscriptionId, body, actor),
  });
  subscriptions.subscriptionService.setBillingReviewReadModel(onboardingCore.store);

  const audit =
    options.audit ??
    createAuditModule({
      persistence,
      resolvePlanEntitlements: async (organizationId) => {
        const access = await subscriptions.subscriptionService.resolveAccessState(organizationId);
        return access?.plan?.entitlements ?? null;
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const capabilities =
    options.capabilities ??
    createCapabilityModule({
      persistence,
      auditStore: audit.store,
      resolveSubscriptionAccessState: (organizationId) =>
        subscriptions.subscriptionService.resolveAccessState(organizationId),
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
      capabilityService: capabilities.capabilityService,
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
      capabilityService: capabilities.capabilityService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(masterRefs === null
        ? {}
        : {
            listBranchReferences: (organizationId, branchId) =>
              masterRefs.listBranchReferences(organizationId, branchId),
            listWarehouseReferences: (organizationId, warehouseId) =>
              masterRefs.listWarehouseReferences(organizationId, warehouseId),
          }),
    });

  const catalog =
    options.catalog ??
    createCatalogModule({
      persistence,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      capabilityService: capabilities.capabilityService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(masterRefs === null
        ? {}
        : {
            listProductReferences: (organizationId, productId) =>
              masterRefs.listProductReferences(organizationId, productId),
            listCategoryReferences: (organizationId, categoryId) =>
              masterRefs.listCategoryReferences(organizationId, categoryId),
          }),
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
      auditStore: audit.store,
      capabilityService: capabilities.capabilityService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(masterRefs === null
        ? {}
        : {
            listCustomerReferences: (organizationId, customerId) =>
              masterRefs.listCustomerReferences(organizationId, customerId),
          }),
    });

  const suppliers =
    options.suppliers ??
    createSuppliersModule({
      persistence,
      evaluateEntitlement: (organizationId, entitlementOptions) =>
        subscriptions.subscriptionService.evaluateEntitlement(organizationId, entitlementOptions),
      ledgersService: options.ledgersService ?? ledgers.ledgersService,
      capabilityService: capabilities.capabilityService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(masterRefs === null
        ? {}
        : {
            listSupplierReferences: (organizationId, supplierId) =>
              masterRefs.listSupplierReferences(organizationId, supplierId),
          }),
    });

  const accounts =
    options.accounts ??
    createAccountsModule({
      persistence,
      capabilityService: capabilities.capabilityService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(masterRefs === null
        ? {}
        : {
            listAccountReferences: (organizationId, accountId) =>
              masterRefs.listAccountReferences(organizationId, accountId),
            listExpenseCategoryReferences: (organizationId, categoryId) =>
              masterRefs.listExpenseCategoryReferences(organizationId, categoryId),
          }),
    });

  const unpaidPurchasesLookup = {
    fn: options.listUnpaidSupplierPurchases ?? null,
  };
  const unpaidSalesLookup = {
    fn: options.listUnpaidCustomerSales ?? null,
  };
  const purchaseReturnCreditsLookup = {
    fn: null,
  };
  const postedReturnsLookup = {
    fn: null,
  };

  if (!ledgers.paymentsService) {
    ledgers.paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      suppliersService: suppliers.suppliersService,
      customersService: customers.customersService,
      capabilityService: capabilities.capabilityService,
      listUnpaidSupplierPurchases: async (organizationId, supplierId) => {
        if (typeof unpaidPurchasesLookup.fn !== 'function') {
          return [];
        }
        return unpaidPurchasesLookup.fn(organizationId, supplierId);
      },
      listUnpaidCustomerSales: async (organizationId, customerId) => {
        if (typeof unpaidSalesLookup.fn !== 'function') {
          return [];
        }
        return unpaidSalesLookup.fn(organizationId, customerId);
      },
    });
  }

  const inventory =
    options.inventory ??
    createInventoryModule({
      persistence,
      catalogService: catalog.catalogService,
      locationsService: locations.locationsService,
      canAccessWarehouse,
      hasPermission: (authContext, permission) =>
        hasPermission(authContext?.permissions ?? [], permission),
      resolveOrganizationTimezone: async (organizationId) => {
        const organization = await onboardingCore.store.findOrganizationById(organizationId);
        return organization?.timezone ?? 'Asia/Karachi';
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const purchases =
    options.purchases ??
    createPurchasesModule({
      persistence,
      catalogService: catalog.catalogService,
      suppliersService: suppliers.suppliersService,
      locationsService: locations.locationsService,
      inventoryService: inventory.inventoryService,
      paymentsService: ledgers.paymentsService,
      accountsService: accounts.accountsService,
      capabilityService: capabilities.capabilityService,
      canAccessWarehouse,
      canAccessBranch,
      listPurchaseReturnCredits: async (organizationId, purchaseId) => {
        if (typeof purchaseReturnCreditsLookup.fn !== 'function') {
          return '0';
        }
        return purchaseReturnCreditsLookup.fn(organizationId, purchaseId);
      },
      listPostedReturnsByPurchase: async (organizationId, purchaseId) => {
        if (typeof postedReturnsLookup.fn !== 'function') {
          return [];
        }
        return postedReturnsLookup.fn(organizationId, purchaseId);
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  if (typeof unpaidPurchasesLookup.fn !== 'function') {
    unpaidPurchasesLookup.fn = (organizationId, supplierId) =>
      purchases.purchasesService.listUnpaidSupplierPurchases(organizationId, supplierId);
  }

  const sales =
    options.sales ??
    createSalesModule({
      persistence,
      catalogService: catalog.catalogService,
      customersService: customers.customersService,
      locationsService: locations.locationsService,
      inventoryService: inventory.inventoryService,
      paymentsService: ledgers.paymentsService,
      accountsService: accounts.accountsService,
      capabilityService: capabilities.capabilityService,
      canAccessWarehouse,
      canAccessBranch,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  if (typeof unpaidSalesLookup.fn !== 'function') {
    unpaidSalesLookup.fn = (organizationId, customerId) =>
      sales.salesService.listUnpaidCustomerSales(organizationId, customerId);
  }

  const returns =
    options.returns ??
    createReturnsModule({
      persistence,
      inventoryService: inventory.inventoryService,
      paymentsService: ledgers.paymentsService,
      accountsService: accounts.accountsService,
      purchasesService: purchases.purchasesService,
      salesService: sales.salesService,
      catalogService: catalog.catalogService,
      customersService: customers.customersService,
      locationsService: locations.locationsService,
      canAccessWarehouse,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const resolveOrganizationTimezone = async (organizationId) => {
    const organization = await onboardingCore.store.findOrganizationById(organizationId);
    return organization?.timezone ?? 'Asia/Karachi';
  };

  const alerts =
    options.alerts ??
    createAlertsModule({
      persistence,
      inventoryService: inventory.inventoryService,
      paymentsService: ledgers.paymentsService,
      salesService: sales.salesService,
      capabilityService: capabilities.capabilityService,
      canAccessWarehouse,
      resolveOrganizationTimezone,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const reporting =
    options.reporting ??
    createReportingModule({
      salesService: sales.salesService,
      purchasesService: purchases.purchasesService,
      accountsService: accounts.accountsService,
      paymentsService: ledgers.paymentsService,
      alertsService: alerts.alertsService,
      returnsService: returns.returnsService,
      inventoryService: inventory.inventoryService,
      catalogService: catalog.catalogService,
      customersService: customers.customersService,
      locationsService: locations.locationsService,
      employeesService: employees.employeesService,
      capabilityService: capabilities.capabilityService,
      resolveOrganizationTimezone,
      resolvePlanEntitlements: async (organizationId) => {
        const access = await subscriptions.subscriptionService.resolveAccessState(organizationId);
        return access?.plan?.entitlements ?? null;
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const operations =
    options.operations ??
    createOperationsModule({
      persistence,
      auditStore: audit.store,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  const imports =
    options.imports ??
    createImportsModule({
      persistence,
      catalogService: catalog.catalogService,
      customersService: customers.customersService,
      suppliersService: suppliers.suppliersService,
      accountsService: accounts.accountsService,
      inventoryService: inventory.inventoryService,
      locationsService: locations.locationsService,
      canAccessWarehouse,
      auditStore: audit.store,
      resolvePlanEntitlements: async (organizationId) => {
        const access = await subscriptions.subscriptionService.resolveAccessState(organizationId);
        return access?.plan?.entitlements ?? null;
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  purchaseReturnCreditsLookup.fn = (organizationId, purchaseId) =>
    returns.listPurchaseReturnCredits(organizationId, purchaseId);
  postedReturnsLookup.fn = (organizationId, purchaseId) =>
    returns.listPostedReturnsByPurchase(organizationId, purchaseId);

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
    updateOrganization: async (id, patch) =>
      onboardingCore.store.updateOrganization(null, id, patch),
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
    capabilityService: capabilities.capabilityService,
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
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const employeesRoutes = registerEmployeesRoutes({
    employeesService: employees.employeesService,
    locationsService: locations.locationsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const catalogRoutes = registerCatalogRoutes({
    catalogService: catalog.catalogService,
    inventoryReader: inventory.inventoryService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const capabilityRoutes = registerCapabilityRoutes({
    config,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    optionalAuth: auth.middlewares.optionalAuth,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
    getOrganization: (organizationId) =>
      onboardingCore.onboardingService.getOrganization(organizationId),
    requireOrganization: (organizationId) =>
      onboardingCore.onboardingService.getOrganization(organizationId),
  });

  const customersRoutes = registerCustomersRoutes({
    customersService: customers.customersService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const suppliersRoutes = registerSuppliersRoutes({
    suppliersService: suppliers.suppliersService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const accountsRoutes = registerAccountsRoutes({
    accountsService: accounts.accountsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const expensesRoutes = registerExpensesRoutes({
    accountsService: accounts.accountsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const inventoryRoutes = registerInventoryRoutes({
    inventoryService: inventory.inventoryService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const paymentsRoutes = registerPaymentsRoutes({
    paymentsService: ledgers.paymentsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const purchasesRoutes = registerPurchasesRoutes({
    purchasesService: purchases.purchasesService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const salesRoutes = registerSalesRoutes({
    salesService: sales.salesService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const returnsRoutes = registerReturnsRoutes({
    returnsService: returns.returnsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const alertsRoutes = registerAlertsRoutes({
    alertsService: alerts.alertsService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const reportingRoutes = registerReportingRoutes({
    reportingService: reporting.reportingService,
    capabilityService: capabilities.capabilityService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
    requireSuspendedReadAccess: subscriptions.middlewares.requireSuspendedReadAccess,
  });

  const importsRoutes = registerImportsRoutes({
    importsService: imports.importsService,
    requireAuth: auth.middlewares.requireAuth,
    requireCsrf: auth.middlewares.requireCsrf,
    requireOperationalAccess: subscriptions.middlewares.requireOperationalAccess,
  });

  const auditRoutes = registerAuditRoutes({
    config,
    auditService: audit.auditService,
    requireAuth: auth.middlewares.requireAuth,
    optionalAuth: auth.middlewares.optionalAuth,
    requireSuspendedReadAccess: subscriptions.middlewares.requireSuspendedReadAccess,
  });

  const operationsRoutes = registerOperationsRoutes({
    config,
    operationsService: operations.operationsService,
    requireCsrf: auth.middlewares.requireCsrf,
    optionalAuth: auth.middlewares.optionalAuth,
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
  app.use(capabilityRoutes);
  app.use(catalogRoutes);
  app.use(customersRoutes);
  app.use(suppliersRoutes);
  app.use(accountsRoutes);
  app.use(expensesRoutes);
  app.use(inventoryRoutes);
  app.use(paymentsRoutes);
  app.use(purchasesRoutes);
  app.use(salesRoutes);
  app.use(returnsRoutes);
  app.use(alertsRoutes);
  app.use(reportingRoutes);
  app.use(importsRoutes);
  app.use(auditRoutes);
  app.use(operationsRoutes);

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
    purchases,
    sales,
    returns,
    alerts,
    reporting,
    imports,
    audit,
    capabilities,
    operations,
    ledgers,
    setupProgressService,
  };

  return app;
}

module.exports = {
  createApp,
};
