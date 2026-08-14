const { Router } = require('express');
const { API_DASHBOARD_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createDashboardController } = require('../controllers/dashboard.controller');

function registerReportingRoutes(deps) {
  const router = Router();
  const controller = createDashboardController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_DASHBOARD_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('dashboard.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getDashboard(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerReportingRoutes,
};
