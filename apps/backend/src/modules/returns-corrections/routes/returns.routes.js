const { Router } = require('express');
const { API_RETURNS_PATH, API_PURCHASES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createReturnsController } = require('../controllers/returns.controller');

function registerReturnsRoutes(deps) {
  const router = Router();
  const controller = createReturnsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_RETURNS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listReturns(req, res, next);
    },
  );

  router.post(
    API_RETURNS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createReturn(req, res, next);
    },
  );

  router.get(
    `${API_RETURNS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getReturn(req, res, next);
    },
  );

  router.patch(
    `${API_RETURNS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateReturn(req, res, next);
    },
  );

  router.post(
    `${API_RETURNS_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postReturn(req, res, next);
    },
  );

  router.post(
    `${API_PURCHASES_PATH}/:purchaseId/returns`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createPurchaseReturn(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerReturnsRoutes,
};
