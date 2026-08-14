const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { API_IDEMPOTENCY_KEY_HEADER } = require('@agrivio/api-contracts');
const { validationFailed } = require('../../../platform/errors/app-error');

function createOperationsController(deps) {
  return {
    async listBackups(req, res, next) {
      try {
        const data = await deps.operationsService.listBackups();
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async initiateRestore(req, res, next) {
      try {
        const idempotencyKey = req.header(API_IDEMPOTENCY_KEY_HEADER);
        if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
          throw validationFailed('Idempotency-Key header is required');
        }
        const data = await deps.operationsService.initiateRestoreCoordination(req.body ?? {}, {
          actorId: req.platformActor.actorId,
          permissions: req.platformActor.permissions,
          idempotencyKey: idempotencyKey.trim(),
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async getRestore(req, res, next) {
      try {
        const data = await deps.operationsService.getRestore(req.params.id);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createOperationsController,
};
