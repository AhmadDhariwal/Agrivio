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
          { enforceCapabilities: true },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getNotificationFeed(req, res, next) {
      try {
        const parsedLimit = Number(req.query.limit);
        const limit = Number.isInteger(parsedLimit)
          ? Math.max(1, Math.min(50, parsedLimit))
          : 6;
        const data = await deps.alertsService.getNotificationFeed(
          requireOrganizationId(req),
          req.authContext,
          limit,
          { enforceCapabilities: true },
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
          { enforceCapabilities: true },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async markNotificationRead(req, res, next) {
      try {
        const data = await deps.alertsService.markNotificationRead(
          requireOrganizationId(req),
          req.authContext.userId,
          req.params.id,
          req.authContext,
          { enforceCapabilities: true },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async markAllNotificationsRead(req, res, next) {
      try {
        const data = await deps.alertsService.markAllNotificationsRead(
          requireOrganizationId(req),
          req.authContext.userId,
          req.authContext,
          { enforceCapabilities: true },
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
          req.authContext,
          { enforceCapabilities: true },
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
