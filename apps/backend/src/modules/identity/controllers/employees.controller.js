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

function createEmployeesController(deps) {
  return {
    async list(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.employeesService.listEmployees(requireOrganizationId(req), {
          search: req.query.search || undefined, skip, pageSize,
        });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async get(req, res, next) {
      try {
        const data = await deps.employeesService.getEmployee(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const data = await deps.employeesService.createEmployee(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async update(req, res, next) {
      try {
        const data = await deps.employeesService.updateEmployee(
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

    async deactivate(req, res, next) {
      try {
        const data = await deps.employeesService.deactivateEmployee(
          requireOrganizationId(req),
          String(req.params.id),
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createEmployeesController,
};
