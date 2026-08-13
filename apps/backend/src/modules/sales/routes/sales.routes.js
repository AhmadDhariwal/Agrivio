const { Router } = require('express');
const { API_SALES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createSalesController } = require('../controllers/sales.controller');

function registerSalesRoutes(deps) {
  const router = Router();
  const controller = createSalesController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_SALES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listSales(req, res, next);
    },
  );

  router.post(
    API_SALES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createSale(req, res, next);
    },
  );

  router.get(
    `${API_SALES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getSale(req, res, next);
    },
  );

  router.patch(
    `${API_SALES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateSale(req, res, next);
    },
  );

  router.delete(
    `${API_SALES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.discardSale(req, res, next);
    },
  );

  router.post(
    `${API_SALES_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postSale(req, res, next);
    },
  );

  router.post(
    `${API_SALES_PATH}/:id/cancel`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.cancel'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.cancelSale(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerSalesRoutes,
};
