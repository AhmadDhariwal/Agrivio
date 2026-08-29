const { Router } = require('express');
const { API_DASHBOARD_PATH, API_REPORTS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createReportingController } = require('../controllers/dashboard.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerReportingRoutes(deps) {
  const router = Router();
  const controller = createReportingController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireSubscriptionAccess =
    deps.requireSuspendedReadAccess ?? deps.requireOperationalAccess;
  const requireReportsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'reports',
    'enabled',
  );
  const requireDashboardModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'dashboard',
    'enabled',
  );

  router.get(
    API_DASHBOARD_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('dashboard.view'),
    deps.requireOperationalAccess,
    requireDashboardModule,
    (req, res, next) => {
      void controller.getDashboard(req, res, next);
    },
  );

  router.get(
    API_REPORTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('reports.view'),
    requireSubscriptionAccess,
    requireReportsModule,
    (req, res, next) => {
      void controller.listCatalog(req, res, next);
    },
  );

  router.get(
    `${API_REPORTS_PATH}/:reportKey`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('reports.view'),
    requireSubscriptionAccess,
    requireReportsModule,
    (req, res, next) => {
      void controller.getReport(req, res, next);
    },
  );

  router.post(
    `${API_REPORTS_PATH}/:reportKey/export`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('reports.export'),
    requireSubscriptionAccess,
    requireReportsModule,
    (req, res, next) => {
      void controller.exportReport(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerReportingRoutes,
};
