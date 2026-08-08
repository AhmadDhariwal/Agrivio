const { Router } = require('express');
const {
  API_HEALTH_LIVENESS_PATH,
  API_OPERATIONS_READINESS_PATH,
} = require('@agrivio/api-contracts');
const { sendSuccessEnvelope } = require('../http/response-envelope');
function registerHealthRoutes(deps) {
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

module.exports = {
  registerHealthRoutes,
};
