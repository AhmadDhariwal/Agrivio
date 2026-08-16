const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');
const { parseMasterStatusQuery } = require('../../../platform/http/master-status-query');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createSuppliersController(deps) {
  return {
    async listSuppliers(req, res, next) {
      try {
        const data = await deps.suppliersService.listSuppliers(requireOrganizationId(req), {
          status: parseMasterStatusQuery(req.query),
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getSupplier(req, res, next) {
      try {
        const data = await deps.suppliersService.getSupplier(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createSupplier(req, res, next) {
      try {
        const data = await deps.suppliersService.createSupplier(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateSupplier(req, res, next) {
      try {
        const data = await deps.suppliersService.updateSupplier(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async deleteSupplier(req, res, next) {
      try {
        const data = await deps.suppliersService.deleteSupplier(
          requireOrganizationId(req),
          String(req.params.id),
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postOpeningBalance(req, res, next) {
      try {
        const result = await deps.suppliersService.postOpeningBalance(
          requireOrganizationId(req),
          String(req.params.id),
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
  createSuppliersController,
};
