const { Router } = require('express');
const { API_ORGANIZATION_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../identity/permission.middleware');
const { createOrganizationController } = require('./organization.controller');

function registerOrganizationRoutes(deps) {
  const router = Router();
  const controller = createOrganizationController(deps);
  const requireAuth = deps.requireAuth;
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireOrganizationView = createRequirePermissionMiddleware('organization.view');
  const requireBillingAccess =
    deps.requireBillingAccess ?? ((_req, _res, next) => next());

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

  return router;
}

module.exports = {
  registerOrganizationRoutes,
};
