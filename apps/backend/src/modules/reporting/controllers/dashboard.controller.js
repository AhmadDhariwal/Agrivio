const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createReportingController(deps) {
  return {
    async getDashboard(req, res, next) {
      try {
        const data = await deps.reportingService.getDashboard(
          requireOrganizationId(req),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listCatalog(req, res, next) {
      try {
        sendSuccessEnvelope(res, 200, deps.reportingService.listReportCatalog());
      } catch (error) {
        next(error);
      }
    },

    async getReport(req, res, next) {
      try {
        const data = await deps.reportingService.getReport(
          requireOrganizationId(req),
          req.params.reportKey,
          req.query,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async exportReport(req, res, next) {
      try {
        const exported = await deps.reportingService.exportReport(
          requireOrganizationId(req),
          req.params.reportKey,
          req.body ?? {},
          req.authContext,
        );
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${exported.filename}"`,
        );
        res.status(200).send(exported.buffer);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createDashboardController: createReportingController,
  createReportingController,
};
