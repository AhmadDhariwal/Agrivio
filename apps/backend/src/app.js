// @ts-check
import express from 'express';
import {
  createErrorHandlerMiddleware,
  createNotFoundMiddleware,
} from './platform/errors/error-handler.middleware.js';
import { registerHealthRoutes } from './platform/health/health.routes.js';
import { createRequestIdMiddleware } from './platform/http/request-id.middleware.js';
import { createStructuredLogger } from './platform/logging/structured-logger.js';

/**
 * @typedef {import('./platform/config/runtime-config.js').ApiEnv} ApiEnv
 * @typedef {import('./platform/database/mongo-connection.js').MongoDatabaseLifecycle} MongoDatabaseLifecycle
 * @typedef {{
 *   config: ApiEnv;
 *   database: MongoDatabaseLifecycle;
 *   logger?: import('./platform/logging/structured-logger.js').StructuredLogger;
 * }} CreateAppOptions
 */

/**
 * @param {CreateAppOptions} options
 * @returns {import('express').Express}
 */
export function createApp(options) {
  const { config, database } = options;
  const logger = options.logger ?? createStructuredLogger({ service: 'backend' });

  const app = express();
  app.disable('x-powered-by');

  app.use(createRequestIdMiddleware());
  app.use(express.json({ limit: '1mb' }));

  app.use(registerHealthRoutes({ database }));

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  return app;
}
