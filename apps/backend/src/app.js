// @ts-check
const express = require('express');
const {
  createErrorHandlerMiddleware,
  createNotFoundMiddleware,
} = require('./platform/errors/error-handler.middleware');
const { registerHealthRoutes } = require('./platform/health/health.routes');
const { createRequestIdMiddleware } = require('./platform/http/request-id.middleware');
const { createStructuredLogger } = require('./platform/logging/structured-logger');
const { createOnboardingModule } = require('./modules/onboarding/onboarding.module');

/**
 * @typedef {import('./platform/config/runtime-config').ApiEnv} ApiEnv
 * @typedef {import('./platform/database/mongo-connection').MongoDatabaseLifecycle} MongoDatabaseLifecycle
 * @typedef {{
 *   config: ApiEnv;
 *   database: MongoDatabaseLifecycle;
 *   logger?: import('./platform/logging/structured-logger').StructuredLogger;
 *   onboarding?: ReturnType<typeof createOnboardingModule>;
 *   onboardingPersistence?: 'memory' | 'mongoose';
 * }} CreateAppOptions
 */

/**
 * @param {CreateAppOptions} options
 * @returns {import('express').Express}
 */
function createApp(options) {
  const { config, database } = options;
  const logger = options.logger ?? createStructuredLogger({ service: 'backend' });

  const onboarding =
    options.onboarding ??
    createOnboardingModule({
      config,
      persistence: options.onboardingPersistence ?? (config.nodeEnv === 'test' ? 'memory' : 'mongoose'),
    });

  const app = express();
  app.disable('x-powered-by');

  app.use(createRequestIdMiddleware());
  app.use(express.json({ limit: '1mb' }));

  app.use(registerHealthRoutes({ database }));
  app.use(onboarding.routes);

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  return app;
}

module.exports = {
  createApp,
};
