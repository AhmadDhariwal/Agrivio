const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

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
        const data = await deps.paymentsService.listSupplierPayments(requireOrganizationId(req), {
          supplierId:
            typeof req.query.supplierId === 'string' && req.query.supplierId.trim() !== ''
              ? req.query.supplierId.trim()
              : undefined,
        });
        sendSuccessEnvelope(res, 200, data);
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
  };
}

module.exports = {
  createPaymentsController,
};
