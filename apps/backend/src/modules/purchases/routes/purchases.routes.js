const { Router } = require('express');
const { API_PURCHASES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createPurchasesController } = require('../controllers/purchases.controller');

function registerPurchasesRoutes(deps) {
  const router = Router();
  const controller = createPurchasesController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_PURCHASES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('purchases.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listPurchases(req, res, next);
    },
  );

  router.post(
    API_PURCHASES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('purchases.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createPurchase(req, res, next);
    },
  );

  router.get(
    `${API_PURCHASES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('purchases.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getPurchase(req, res, next);
    },
  );

  router.patch(
    `${API_PURCHASES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('purchases.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updatePurchase(req, res, next);
    },
  );

  router.delete(
    `${API_PURCHASES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('purchases.create'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.discardPurchase(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerPurchasesRoutes,
};
