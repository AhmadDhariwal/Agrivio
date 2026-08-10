const { Router } = require('express');
const { API_SETTINGS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createSettingsController } = require('../controllers/settings.controller');

function registerSettingsRoutes(deps) {
  const router = Router();
  const controller = createSettingsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireSettingsView = createRequirePermissionMiddleware('settings.view');
  const requireSettingsManage = createRequirePermissionMiddleware('settings.manage');

  router.get(
    API_SETTINGS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    requireSettingsView,
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.get(req, res, next);
    },
  );

  router.patch(
    API_SETTINGS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    requireSettingsManage,
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.patch(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerSettingsRoutes,
};
