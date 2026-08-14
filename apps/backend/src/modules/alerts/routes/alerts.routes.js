const { Router } = require('express');
const {
  API_ALERTS_PATH,
  API_NOTIFICATIONS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createAlertsController } = require('../controllers/alerts.controller');

function registerAlertsRoutes(deps) {
  const router = Router();
  const controller = createAlertsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_ALERTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listAlerts(req, res, next);
    },
  );

  router.get(
    API_NOTIFICATIONS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listNotifications(req, res, next);
    },
  );

  router.post(
    `${API_NOTIFICATIONS_PATH}/:id/acknowledge`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.acknowledgeNotification(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerAlertsRoutes,
};
