const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

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
        const data = await deps.locationsService.listBranches(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
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

    async listWarehouses(req, res, next) {
      try {
        const data = await deps.locationsService.listWarehouses(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
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
