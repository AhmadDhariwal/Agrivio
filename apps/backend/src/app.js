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

function createApp(options) {
  const { config, database } = options;
  const logger = options.logger ?? createStructuredLogger({ service: 'backend' });
  const persistence =
    options.onboardingPersistence ?? (config.nodeEnv === 'test' ? 'memory' : 'mongoose');
  const authPersistence = options.authPersistence ?? persistence;

  const onboardingCore =
    options.onboarding ??
    createOnboardingModule({
      config,
      persistence,
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
    });

  const onboardingRoutes = registerOnboardingRoutes({
    config,
    onboardingService: onboardingCore.onboardingService,
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

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  return app;
}

module.exports = {
  createApp,
};
