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

function createPaymentsController(deps) {
  return {
    async listSupplierPayments(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.paymentsService.listSupplierPayments(requireOrganizationId(req), {
          supplierId:
            typeof req.query.supplierId === 'string' && req.query.supplierId.trim() !== ''
              ? req.query.supplierId.trim()
              : undefined,
          paymentDate:
            typeof req.query.paymentDate === 'string' && req.query.paymentDate.trim() !== ''
              ? req.query.paymentDate.trim()
              : (typeof req.query.search === 'string' && req.query.search.trim() !== ''
                  ? req.query.search.trim()
                  : undefined),
          skip,
          pageSize,
        });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getSupplierPayment(req, res, next) {
      try {
        const data = await deps.paymentsService.getSupplierPayment(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postSupplierPayment(req, res, next) {
      try {
        const result = await deps.paymentsService.postSupplierPayment(
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

    async listSupplierLedger(req, res, next) {
      try {
        const data = await deps.paymentsService.listSupplierLedger(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listUnpaidPurchasesForSupplier(req, res, next) {
      try {
        const data = await deps.paymentsService.listUnpaidPurchasesForSupplier(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async reconcileSupplierLedger(req, res, next) {
      try {
        const data = await deps.paymentsService.reconcileSupplierLedger(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listCustomerPayments(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.paymentsService.listCustomerPayments(requireOrganizationId(req), {
          customerId:
            typeof req.query.customerId === 'string' && req.query.customerId.trim() !== ''
              ? req.query.customerId.trim()
              : undefined,
          paymentDate:
            typeof req.query.paymentDate === 'string' && req.query.paymentDate.trim() !== ''
              ? req.query.paymentDate.trim()
              : (typeof req.query.search === 'string' && req.query.search.trim() !== ''
                  ? req.query.search.trim()
                  : undefined),
          skip,
          pageSize,
        });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getCustomerPayment(req, res, next) {
      try {
        const data = await deps.paymentsService.getCustomerPayment(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postCustomerPayment(req, res, next) {
      try {
        const result = await deps.paymentsService.postCustomerPayment(
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

    async listCustomerLedger(req, res, next) {
      try {
        const data = await deps.paymentsService.listCustomerLedger(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async correctPayment(req, res, next) {
      try {
        const result = await deps.paymentsService.correctPayment(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
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
  createPaymentsController,
};
