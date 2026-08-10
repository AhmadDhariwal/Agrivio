const { Router } = require('express');
const {
  API_ORGANIZATION_PATH,
  API_ORGANIZATION_SETUP_PROGRESS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createOrganizationController } = require('../controllers/organization.controller');

function registerOrganizationRoutes(deps) {
  const router = Router();
  const controller = createOrganizationController(deps);
  const requireAuth = deps.requireAuth;
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireOrganizationView = createRequirePermissionMiddleware('organization.view');
  const requireOrganizationUpdate = createRequirePermissionMiddleware('organization.update');
  const requireSettingsView = createRequirePermissionMiddleware('settings.view');
  const requireBillingAccess =
    deps.requireBillingAccess ?? ((_req, _res, next) => next());
  const requireOperationalAccess =
    deps.requireOperationalAccess ?? ((_req, _res, next) => next());
  const requireCsrf = deps.requireCsrf ?? ((_req, _res, next) => next());

  router.get(
    API_ORGANIZATION_PATH,
    requireAuth,
    requireOrganizationContext,
    requireOrganizationView,
    requireBillingAccess,
    (req, res, next) => {
      void controller.getCurrent(req, res, next);
    },
  );

  router.patch(
    API_ORGANIZATION_PATH,
    requireAuth,
    requireCsrf,
    requireOrganizationContext,
    requireOrganizationUpdate,
    requireOperationalAccess,
    (req, res, next) => {
      void controller.patchCurrent(req, res, next);
    },
  );

  router.get(
    API_ORGANIZATION_SETUP_PROGRESS_PATH,
    requireAuth,
    requireOrganizationContext,
    requireSettingsView,
    requireOperationalAccess,
    (req, res, next) => {
      void controller.getSetupProgress(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerOrganizationRoutes,
};
