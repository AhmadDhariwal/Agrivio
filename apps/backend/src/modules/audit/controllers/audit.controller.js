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

function createAuditController(deps) {
  return {
    async listOrganization(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.auditService.queryOrganizationEvents(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
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

    async listOrganizationFilterOptions(req, res, next) {
      try {
        const data = await deps.auditService.queryOrganizationFilterOptions(
          requireOrganizationId(req),
          req.query,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listPlatform(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.auditService.queryPlatformEvents({ ...req.query, skip, pageSize });
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createAuditController,
};
