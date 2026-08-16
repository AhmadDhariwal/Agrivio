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

function createCustomersController(deps) {
  return {
    async listCustomers(req, res, next) {
      try {
        const data = await deps.customersService.listCustomers(requireOrganizationId(req), {
          status: parseMasterStatusQuery(req.query),
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getCustomer(req, res, next) {
      try {
        const data = await deps.customersService.getCustomer(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createCustomer(req, res, next) {
      try {
        const data = await deps.customersService.createCustomer(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateCustomer(req, res, next) {
      try {
        const data = await deps.customersService.updateCustomer(
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

    async deleteCustomer(req, res, next) {
      try {
        const data = await deps.customersService.deleteCustomer(
          requireOrganizationId(req),
          String(req.params.id),
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async updateCreditPolicy(req, res, next) {
      try {
        const data = await deps.customersService.updateCreditPolicy(
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

    async postOpeningBalance(req, res, next) {
      try {
        const result = await deps.customersService.postOpeningBalance(
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
  createCustomersController,
};
