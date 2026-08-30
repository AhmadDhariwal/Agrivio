const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');
const { actorFromRequest, requireOrganizationId } = require('../request-actor');

function createEmployeesController(deps) {
  return {
    async accessPolicy(req, res, next) {
      try {
        const data = await deps.employeesService.getAccessPolicy(actorFromRequest(req));
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async list(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total, summary } = await deps.employeesService.listEmployees(
          requireOrganizationId(req),
          {
            search: req.query.search || undefined,
            skip,
            pageSize,
          },
          actorFromRequest(req),
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total, summary });
      } catch (error) {
        next(error);
      }
    },

    async get(req, res, next) {
      try {
        const data = await deps.employeesService.getEmployee(
          requireOrganizationId(req),
          String(req.params.id),
          actorFromRequest(req),
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
          actorFromRequest(req),
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
          actorFromRequest(req),
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
          actorFromRequest(req),
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
