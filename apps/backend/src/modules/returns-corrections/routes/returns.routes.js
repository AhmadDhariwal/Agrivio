const { Router } = require('express');
const { API_RETURNS_PATH, API_PURCHASES_PATH, API_SALES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createReturnsController } = require('../controllers/returns.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerReturnsRoutes(deps) {
  const router = Router();
  const controller = createReturnsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireReturnsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'returns',
    'enabled',
  );
  const requireReturnPost = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'returns.actions.post',
    'allowed',
  );
  const requireReturnWithoutInvoice = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'returns.actions.withoutInvoice',
    'allowed',
  );
  const requireReturnReverse = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'returns.actions.reverse',
    'allowed',
  );
  const requireReturnInspect = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'returns.actions.inspect',
    'allowed',
  );
  const requirePurchaseReturn = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'purchases.actions.createReturn',
    'allowed',
  );

  router.get(
    API_RETURNS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.view'),
    deps.requireOperationalAccess,
    requireReturnsModule,
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
    createRequirePermissionMiddleware('purchases.return'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnPost,
    requirePurchaseReturn,
    (req, res, next) => {
      void controller.createReturn(req, res, next);
    },
  );

  router.post(
    `${API_RETURNS_PATH}/without-invoice`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnWithoutInvoice,
    (req, res, next) => {
      void controller.createWithoutInvoiceReturn(req, res, next);
    },
  );

  router.get(
    `${API_RETURNS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.view'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnInspect,
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
    requireReturnsModule,
    requireReturnPost,
    (req, res, next) => {
      void controller.updateReturn(req, res, next);
    },
  );

  router.delete(
    `${API_RETURNS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    (req, res, next) => {
      void controller.discardReturn(req, res, next);
    },
  );

  router.post(
    `${API_RETURNS_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnPost,
    (req, res, next) => {
      void controller.postReturn(req, res, next);
    },
  );

  router.post(
    `${API_RETURNS_PATH}/:id/reverse`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.reverse'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnReverse,
    (req, res, next) => {
      void controller.reverseReturn(req, res, next);
    },
  );

  router.post(
    `${API_PURCHASES_PATH}/:purchaseId/returns`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    createRequirePermissionMiddleware('purchases.return'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnPost,
    requirePurchaseReturn,
    (req, res, next) => {
      void controller.createPurchaseReturn(req, res, next);
    },
  );

  router.post(
    `${API_SALES_PATH}/:saleId/returns`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('returns.post'),
    deps.requireOperationalAccess,
    requireReturnsModule,
    requireReturnPost,
    (req, res, next) => {
      void controller.createSalesReturn(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerReturnsRoutes,
};
