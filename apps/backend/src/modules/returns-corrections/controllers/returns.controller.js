const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createReturnsController(deps) {
  return {
    async listReturns(req, res, next) {
      try {
        const data = await deps.returnsService.listReturns(
          requireOrganizationId(req),
          {
            status:
              typeof req.query.status === 'string' && req.query.status.trim() !== ''
                ? req.query.status.trim()
                : undefined,
            supplierId:
              typeof req.query.supplierId === 'string' && req.query.supplierId.trim() !== ''
                ? req.query.supplierId.trim()
                : undefined,
            warehouseId:
              typeof req.query.warehouseId === 'string' && req.query.warehouseId.trim() !== ''
                ? req.query.warehouseId.trim()
                : undefined,
            purchaseId:
              typeof req.query.purchaseId === 'string' && req.query.purchaseId.trim() !== ''
                ? req.query.purchaseId.trim()
                : undefined,
          },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getReturn(req, res, next) {
      try {
        const data = await deps.returnsService.getReturn(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createPurchaseReturn(req, res, next) {
      try {
        const organizationId = requireOrganizationId(req);
        const purchaseId = String(req.params.purchaseId ?? req.body?.purchaseId ?? '');
        const data = await deps.returnsService.createPurchaseReturnDraft(
          organizationId,
          purchaseId,
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async createReturn(req, res, next) {
      try {
        const organizationId = requireOrganizationId(req);
        const data = await deps.returnsService.createPurchaseReturnDraft(
          organizationId,
          String(req.body?.purchaseId ?? ''),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateReturn(req, res, next) {
      try {
        const data = await deps.returnsService.updateReturnDraft(
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

    async postReturn(req, res, next) {
      try {
        const result = await deps.returnsService.postReturn(
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
  createReturnsController,
};
