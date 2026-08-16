const { createInMemoryAuthStore } = require('./auth.memory-store');
const { createMongooseAuthStore } = require('./auth.mongoose-store');
const { createAuthService } = require('./auth.service');
const { registerAuthRoutes } = require('./routes/auth.routes');
const {
  createCorsMiddleware,
  createOriginGuardMiddleware,
  createRequireCsrfMiddleware,
  createAuthTransportMiddleware,
  createRequireAuthMiddleware,
  createOptionalAuthMiddleware,
} = require('./auth.middleware');
const {
  createRequirePermissionMiddleware,
  createRequireOrganizationContextMiddleware,
  createRequireBranchAccessMiddleware,
  createRequireWarehouseAccessMiddleware,
} = require('./permission.middleware');

const { createNavigationPreferencesService } = require('./navigation-preferences.service');

function createAuthModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAuthStore() : createInMemoryAuthStore());

  const authService = createAuthService({
    store,
    nodeEnv: options.config.nodeEnv,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.resolveSubscriptionAccessState === undefined
      ? {}
      : { resolveSubscriptionAccessState: options.resolveSubscriptionAccessState }),
  });

  const navigationPreferencesService =
    options.navigationPreferencesService ??
    createNavigationPreferencesService({
      persistence,
    });

  const requireAuth = createRequireAuthMiddleware({ authService });

  return {
    store,
    authService,
    navigationPreferencesService,
    routes: registerAuthRoutes({
      config: options.config,
      authService,
      navigationPreferencesService,
      ...(options.onboardingService === undefined
        ? {}
        : { onboardingService: options.onboardingService }),
    }),
    middlewares: {
      cors: createCorsMiddleware(options.config),
      originGuard: createOriginGuardMiddleware(options.config),
      authTransport: createAuthTransportMiddleware(),
      requireCsrf: createRequireCsrfMiddleware({ authService }),
      requireAuth,
      optionalAuth: createOptionalAuthMiddleware({ authService }),
      requirePermission: createRequirePermissionMiddleware,
      requireOrganizationContext: createRequireOrganizationContextMiddleware(),
      requireBranchAccess: createRequireBranchAccessMiddleware,
      requireWarehouseAccess: createRequireWarehouseAccessMiddleware,
    },
  };
}

module.exports = {
  createAuthModule,
};
