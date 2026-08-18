const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');
const { parseMasterStatusQuery } = require('../../../platform/http/master-status-query');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createLocationsController(deps) {
  return {
    async listBranches(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.locationsService.listBranches(requireOrganizationId(req), {
          status: parseMasterStatusQuery(req.query),
          search: req.query.search || undefined, skip, pageSize,
        });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getBranch(req, res, next) {
      try {
        const data = await deps.locationsService.getBranch(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createBranch(req, res, next) {
      try {
        const data = await deps.locationsService.createBranch(requireOrganizationId(req), req.body, {
          actorId: String(req.authContext.userId),
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateBranch(req, res, next) {
      try {
        const data = await deps.locationsService.updateBranch(
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

    async deleteBranch(req, res, next) {
      try {
        const data = await deps.locationsService.deleteBranch(
          requireOrganizationId(req),
          String(req.params.id),
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listWarehouses(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.locationsService.listWarehouses(requireOrganizationId(req), {
          status: parseMasterStatusQuery(req.query),
          search: req.query.search || undefined, skip, pageSize,
        });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getWarehouse(req, res, next) {
      try {
        const data = await deps.locationsService.getWarehouse(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createWarehouse(req, res, next) {
      try {
        const data = await deps.locationsService.createWarehouse(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateWarehouse(req, res, next) {
      try {
        const data = await deps.locationsService.updateWarehouse(
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

    async deleteWarehouse(req, res, next) {
      try {
        const data = await deps.locationsService.deleteWarehouse(
          requireOrganizationId(req),
          String(req.params.id),
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async replaceAccessAssignments(req, res, next) {
      try {
        const data = await deps.locationsService.replaceAccessAssignments(
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
  };
}

module.exports = {
  createLocationsController,
};
