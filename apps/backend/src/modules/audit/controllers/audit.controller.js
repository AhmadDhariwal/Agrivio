const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createAuditController(deps) {
  return {
    async listOrganization(req, res, next) {
      try {
        const data = await deps.auditService.queryOrganizationEvents(
          requireOrganizationId(req),
          req.query,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getOrganization(req, res, next) {
      try {
        const data = await deps.auditService.getOrganizationEvent(
          requireOrganizationId(req),
          req.params.id,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listPlatform(req, res, next) {
      try {
        const data = await deps.auditService.queryPlatformEvents(req.query);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createAuditController,
};
