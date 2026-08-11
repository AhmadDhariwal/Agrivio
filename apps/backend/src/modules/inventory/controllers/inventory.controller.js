const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createInventoryController(deps) {
  return {
    async listBalances(req, res, next) {
      try {
        const data = await deps.inventoryService.listBalances(
          requireOrganizationId(req),
          req.query,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listMovements(req, res, next) {
      try {
        const data = await deps.inventoryService.listMovements(
          requireOrganizationId(req),
          req.query,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listBatches(req, res, next) {
      try {
        const data = await deps.inventoryService.listBatches(
          requireOrganizationId(req),
          req.query,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getBatch(req, res, next) {
      try {
        const data = await deps.inventoryService.getBatch(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postOpeningStock(req, res, next) {
      try {
        const result = await deps.inventoryService.postOpeningStock(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 201, result.data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createInventoryController,
};
