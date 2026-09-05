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

function createSalesController(deps) {
  return {
    async listSales(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.salesService.listSales(
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
            search: typeof req.query.search === 'string' ? req.query.search : undefined,
            saleDate:
              typeof req.query.saleDate === 'string' && req.query.saleDate.trim() !== ''
                ? req.query.saleDate.trim()
                : undefined,
            fromDate:
              typeof req.query.fromDate === 'string' && req.query.fromDate.trim() !== ''
                ? req.query.fromDate.trim()
                : undefined,
            toDate:
              typeof req.query.toDate === 'string' && req.query.toDate.trim() !== ''
                ? req.query.toDate.trim()
                : undefined,
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

    async getSalePrintInvoice(req, res, next) {
      try {
        const data = await deps.salesService.getSalePrintInvoice(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listPosPaymentAccounts(req, res, next) {
      try {
        const data = await deps.salesService.listPosPaymentAccounts(requireOrganizationId(req));
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
