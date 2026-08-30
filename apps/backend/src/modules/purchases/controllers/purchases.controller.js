const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createPurchasesController(deps) {
  return {
    async listPurchases(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.purchasesService.listPurchases(
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
            search: typeof req.query.search === 'string' ? req.query.search : undefined,
            skip,
            pageSize,
          },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getPurchase(req, res, next) {
      try {
        const data = await deps.purchasesService.getPurchase(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createPurchase(req, res, next) {
      try {
        const data = await deps.purchasesService.createPurchaseDraft(
          requireOrganizationId(req),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updatePurchase(req, res, next) {
      try {
        const data = await deps.purchasesService.updatePurchaseDraft(
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

    async discardPurchase(req, res, next) {
      try {
        const data = await deps.purchasesService.discardPurchaseDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postPurchase(req, res, next) {
      try {
        const result = await deps.purchasesService.postPurchase(
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

    async cancelPurchase(req, res, next) {
      try {
        const result = await deps.purchasesService.cancelPurchase(
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
  createPurchasesController,
};
