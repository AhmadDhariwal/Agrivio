const { Router } = require('express');
const { API_SALES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createSalesController } = require('../controllers/sales.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerSalesRoutes(deps) {
  const router = Router();
  const controller = createSalesController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireSalesModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'sales',
    'enabled',
  );
  const requireAction = (action) =>
    createRequireCapabilityMiddleware(
      deps.capabilityService,
      `sales.actions.${action}`,
      'allowed',
    );

  router.get(
    API_SALES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.view'),
    deps.requireOperationalAccess,
    requireSalesModule,
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
    requireSalesModule,
    requireAction('createDraft'),
    (req, res, next) => {
      void controller.createSale(req, res, next);
    },
  );

  router.get(
    `${API_SALES_PATH}/payment-accounts`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.create'),
    deps.requireOperationalAccess,
    requireSalesModule,
    requireAction('addPaymentAtPost'),
    (req, res, next) => {
      void controller.listPosPaymentAccounts(req, res, next);
    },
  );

  router.get(
    `${API_SALES_PATH}/:id/print`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.view'),
    deps.requireOperationalAccess,
    requireSalesModule,
    requireAction('print'),
    (req, res, next) => {
      void controller.getSalePrintInvoice(req, res, next);
    },
  );

  router.get(
    `${API_SALES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('sales.view'),
    deps.requireOperationalAccess,
    requireSalesModule,
    requireAction('inspect'),
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
    requireSalesModule,
    requireAction('editDraft'),
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
    requireSalesModule,
    requireAction('discardDraft'),
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
    requireSalesModule,
    requireAction('post'),
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
    requireSalesModule,
    requireAction('cancel'),
    (req, res, next) => {
      void controller.cancelSale(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerSalesRoutes,
};
