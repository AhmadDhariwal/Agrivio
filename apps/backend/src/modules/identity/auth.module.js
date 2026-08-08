const { createInMemoryAuthStore } = require('./auth.memory-store');
const { createMongooseAuthStore } = require('./auth.mongoose-store');
const { createAuthService } = require('./auth.service');
const { registerAuthRoutes } = require('./auth.routes');
const {
  createOriginGuardMiddleware,
  createRequireCsrfMiddleware,
  createAuthTransportMiddleware,
  createRequireAuthMiddleware,
  createOptionalAuthMiddleware,
} = require('./auth.middleware');
const {
  createRequirePermissionMiddleware,
  createRequireOrganizationContextMiddleware,
} = require('./permission.middleware');

function createAuthModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAuthStore() : createInMemoryAuthStore());

  const authService = createAuthService({
    store,
    nodeEnv: options.config.nodeEnv,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  const requireAuth = createRequireAuthMiddleware({ authService });

  return {
    store,
    authService,
    routes: registerAuthRoutes({
      config: options.config,
      authService,
      ...(options.onboardingService === undefined
        ? {}
        : { onboardingService: options.onboardingService }),
    }),
    middlewares: {
      originGuard: createOriginGuardMiddleware(options.config),
      authTransport: createAuthTransportMiddleware(),
      requireCsrf: createRequireCsrfMiddleware({ authService }),
      requireAuth,
      optionalAuth: createOptionalAuthMiddleware({ authService }),
      requirePermission: createRequirePermissionMiddleware,
      requireOrganizationContext: createRequireOrganizationContextMiddleware(),
    },
  };
}

module.exports = {
  createAuthModule,
};
