const { Router } = require('express');
const {
  API_ALERTS_PATH,
  API_NOTIFICATIONS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');
const { createAlertsController } = require('../controllers/alerts.controller');

function registerAlertsRoutes(deps) {
  const router = Router();
  const controller = createAlertsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  const requireAlertsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'alerts',
    'enabled',
  );
  const requireNavbarNotifications = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'alerts.features.navbarNotifications',
    'enabled',
  );
  const requireMarkAllRead = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'alerts.actions.markAllRead',
    'allowed',
  );
  const requireMarkRead = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'alerts.actions.markRead',
    'allowed',
  );
  const requireAcknowledge = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'alerts.actions.acknowledge',
    'allowed',
  );

  router.get(
    API_ALERTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    (req, res, next) => {
      void controller.listAlerts(req, res, next);
    },
  );

  router.get(
    `${API_NOTIFICATIONS_PATH}/feed`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    requireNavbarNotifications,
    (req, res, next) => {
      void controller.getNotificationFeed(req, res, next);
    },
  );

  router.get(
    API_NOTIFICATIONS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    (req, res, next) => {
      void controller.listNotifications(req, res, next);
    },
  );

  router.post(
    `${API_NOTIFICATIONS_PATH}/mark-all-read`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    requireMarkAllRead,
    (req, res, next) => {
      void controller.markAllNotificationsRead(req, res, next);
    },
  );

  router.post(
    `${API_NOTIFICATIONS_PATH}/:id/read`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    requireMarkRead,
    (req, res, next) => {
      void controller.markNotificationRead(req, res, next);
    },
  );

  router.post(
    `${API_NOTIFICATIONS_PATH}/:id/acknowledge`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('alerts.view'),
    deps.requireOperationalAccess,
    requireAlertsModule,
    requireAcknowledge,
    (req, res, next) => {
      void controller.acknowledgeNotification(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerAlertsRoutes,
};
