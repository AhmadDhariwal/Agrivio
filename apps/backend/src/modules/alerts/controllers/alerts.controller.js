const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createAlertsController(deps) {
  return {
    async listAlerts(req, res, next) {
      try {
        const data = await deps.alertsService.listAlerts(
          requireOrganizationId(req),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listNotifications(req, res, next) {
      try {
        const data = await deps.alertsService.listNotifications(
          requireOrganizationId(req),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async acknowledgeNotification(req, res, next) {
      try {
        const data = await deps.alertsService.acknowledgeNotification(
          requireOrganizationId(req),
          req.params.id,
          req.authContext.userId,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createAlertsController,
};
