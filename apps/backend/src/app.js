// @ts-check
import express from 'express';
import {
  createErrorHandlerMiddleware,
  createNotFoundMiddleware,
} from './platform/errors/error-handler.middleware.js';
import { registerHealthRoutes } from './platform/health/health.routes.js';
import { createRequestIdMiddleware } from './platform/http/request-id.middleware.js';
import { createStructuredLogger } from './platform/logging/structured-logger.js';
import {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
} from './platform/idempotency/idempotency-service.js';
import { createAuditWriter, createInMemoryAuditEventStore } from './platform/audit/audit-writer.js';
import {
  createTransactionRunner,
  createMockTransactionSessionPort,
} from './platform/transactions/transaction-runner.js';

import { createOnboardingRouter } from './modules/platform/routes/onboarding.routes.js';
import { createPlatformOrgRouter } from './modules/platform/routes/platform-org.routes.js';
import { createAuthRouter } from './modules/identity-access/routes/auth.routes.js';
import { createOnboardingService } from './modules/platform/services/onboarding.service.js';
import { createPlatformOrgService } from './modules/platform/services/platform-org.service.js';
import { createActivationService } from './modules/identity-access/services/activation.service.js';
import { createUserStore } from './modules/identity-access/services/user.store.js';
import { createMembershipStore } from './modules/identity-access/services/membership.store.js';
import { createOrganizationStore } from './modules/organizations/services/organization.store.js';
import { createActivationTokenStore } from './modules/identity-access/services/activation-token.store.js';
import { createSubscriptionStore } from './modules/subscriptions/services/subscription.store.js';
import { createDevPlatformActorMiddleware } from './modules/platform/middleware/platform-auth.middleware.js';

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

  // --- F02: Organization Onboarding & Platform Routes ---
  const idempotencyService = createIdempotencyService(createInMemoryIdempotencyStore());
  const auditWriter = createAuditWriter(createInMemoryAuditEventStore());
  const { port: txPort } = createMockTransactionSessionPort();
  const transactionRunner = createTransactionRunner(txPort);

  const userStore = createUserStore();
  const membershipStore = createMembershipStore();
  const organizationStore = createOrganizationStore();
  const activationTokenStore = createActivationTokenStore();
  const subscriptionStore = createSubscriptionStore();

  const onboardingService = createOnboardingService({
    userStore,
    organizationStore,
    membershipStore,
    auditWriter,
  });

  const platformOrgService = createPlatformOrgService({
    organizationStore,
    membershipStore,
    activationTokenStore,
    subscriptionStore,
    auditWriter,
    transactionRunner,
  });

  const activationService = createActivationService({
    activationTokenStore,
    userStore,
    auditWriter,
    transactionRunner,
  });

  // Platform actor extraction from header (dev/test; replaced by sessions in R1-F02-003)
  app.use(createDevPlatformActorMiddleware(config));

  app.use(createOnboardingRouter({ onboardingService, idempotencyService }));
  app.use(createPlatformOrgRouter({ platformOrgService, idempotencyService }));
  app.use(createAuthRouter({ activationService }));
  // --- end F02 ---

  app.use(createNotFoundMiddleware(config.nodeEnv));
  app.use(createErrorHandlerMiddleware(config.nodeEnv, logger));

  return app;
}
