// @ts-check
import { Router } from 'express';
import { API_HEALTH_LIVENESS_PATH, API_OPERATIONS_READINESS_PATH } from '@agrivio/api-contracts';
import { sendSuccessEnvelope } from '../http/response-envelope.js';

/**
 * @typedef {import('../database/mongo-connection.js').MongoDatabaseLifecycle} MongoDatabaseLifecycle
 * @param {{ database: MongoDatabaseLifecycle }} deps
 */
export function registerHealthRoutes(deps) {
  const router = Router();

  router.get(API_HEALTH_LIVENESS_PATH, (_req, res) => {
    sendSuccessEnvelope(res, 200, { status: 'ok' });
  });

  router.get(API_OPERATIONS_READINESS_PATH, async (_req, res) => {
    const ready = await deps.database.isReady();
    if (!ready) {
      sendSuccessEnvelope(res, 503, { status: 'not_ready' });
      return;
    }

    sendSuccessEnvelope(res, 200, { status: 'ready' });
  });

  return router;
}
