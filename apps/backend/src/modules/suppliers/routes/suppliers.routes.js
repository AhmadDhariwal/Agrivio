const { Router } = require('express');
const { API_SUPPLIERS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createSuppliersController } = require('../controllers/suppliers.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerSuppliersRoutes(deps) {
  const router = Router();
  const controller = createSuppliersController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireSuppliersModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'suppliers',
    'enabled',
  );
  const requireCreateAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'suppliers.actions.create',
    'allowed',
  );
  const requireEditAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'suppliers.actions.edit',
    'allowed',
  );
  const requireDeleteAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'suppliers.actions.delete',
    'allowed',
  );
  const requirePostOpeningBalanceAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'suppliers.actions.postOpeningBalance',
    'allowed',
  );

  router.get(
    API_SUPPLIERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.view'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    (req, res, next) => {
      void controller.listSuppliers(req, res, next);
    },
  );

  router.post(
    API_SUPPLIERS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.manage'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    requireCreateAllowed,
    (req, res, next) => {
      void controller.createSupplier(req, res, next);
    },
  );

  router.get(
    `${API_SUPPLIERS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.view'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    (req, res, next) => {
      void controller.getSupplier(req, res, next);
    },
  );

  router.patch(
    `${API_SUPPLIERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.manage'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    requireEditAllowed,
    (req, res, next) => {
      void controller.updateSupplier(req, res, next);
    },
  );

  router.delete(
    `${API_SUPPLIERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.manage'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    requireDeleteAllowed,
    (req, res, next) => {
      void controller.deleteSupplier(req, res, next);
    },
  );

  router.post(
    `${API_SUPPLIERS_PATH}/:id/opening-balance`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('suppliers.opening-balance.post'),
    deps.requireOperationalAccess,
    requireSuppliersModule,
    requirePostOpeningBalanceAllowed,
    (req, res, next) => {
      void controller.postOpeningBalance(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerSuppliersRoutes,
};
