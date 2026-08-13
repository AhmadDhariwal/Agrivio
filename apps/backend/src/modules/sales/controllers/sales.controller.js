const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createSalesController(deps) {
  return {
    async listSales(req, res, next) {
      try {
        const data = await deps.salesService.listSales(
          requireOrganizationId(req),
          {
            status:
              typeof req.query.status === 'string' && req.query.status.trim() !== ''
                ? req.query.status.trim()
                : undefined,
            customerId:
              typeof req.query.customerId === 'string' && req.query.customerId.trim() !== ''
                ? req.query.customerId.trim()
                : undefined,
            warehouseId:
              typeof req.query.warehouseId === 'string' && req.query.warehouseId.trim() !== ''
                ? req.query.warehouseId.trim()
                : undefined,
            branchId:
              typeof req.query.branchId === 'string' && req.query.branchId.trim() !== ''
                ? req.query.branchId.trim()
                : undefined,
          },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getSale(req, res, next) {
      try {
        const data = await deps.salesService.getSale(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createSale(req, res, next) {
      try {
        const data = await deps.salesService.createSaleDraft(
          requireOrganizationId(req),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateSale(req, res, next) {
      try {
        const data = await deps.salesService.updateSaleDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async discardSale(req, res, next) {
      try {
        const data = await deps.salesService.discardSaleDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postSale(req, res, next) {
      try {
        const result = await deps.salesService.postSale(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async cancelSale(req, res, next) {
      try {
        const result = await deps.salesService.cancelSale(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createSalesController,
};
