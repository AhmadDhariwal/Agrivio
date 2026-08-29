const { Router } = require('express');
const { API_BRANCHES_PATH, API_WAREHOUSES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createLocationsController } = require('../controllers/locations.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerLocationsRoutes(deps) {
  const router = Router();
  const controller = createLocationsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireWarehousesModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'warehouses',
    'enabled',
  );
  const requireWarehouseCreateAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'warehouses.actions.create',
    'allowed',
  );
  const requireWarehouseDeleteAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'warehouses.actions.delete',
    'allowed',
  );

  router.get(
    API_BRANCHES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('branches.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listBranches(req, res, next);
    },
  );

  router.post(
    API_BRANCHES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('branches.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createBranch(req, res, next);
    },
  );

  router.get(
    `${API_BRANCHES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('branches.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getBranch(req, res, next);
    },
  );

  router.patch(
    `${API_BRANCHES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('branches.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateBranch(req, res, next);
    },
  );

  router.delete(
    `${API_BRANCHES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('branches.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.deleteBranch(req, res, next);
    },
  );

  router.get(
    API_WAREHOUSES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('warehouses.view'),
    deps.requireOperationalAccess,
    requireWarehousesModule,
    (req, res, next) => {
      void controller.listWarehouses(req, res, next);
    },
  );

  router.post(
    API_WAREHOUSES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('warehouses.manage'),
    deps.requireOperationalAccess,
    requireWarehousesModule,
    requireWarehouseCreateAllowed,
    (req, res, next) => {
      void controller.createWarehouse(req, res, next);
    },
  );

  router.get(
    `${API_WAREHOUSES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('warehouses.view'),
    deps.requireOperationalAccess,
    requireWarehousesModule,
    (req, res, next) => {
      void controller.getWarehouse(req, res, next);
    },
  );

  router.patch(
    `${API_WAREHOUSES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('warehouses.manage'),
    deps.requireOperationalAccess,
    requireWarehousesModule,
    (req, res, next) => {
      void controller.updateWarehouse(req, res, next);
    },
  );

  router.delete(
    `${API_WAREHOUSES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('warehouses.manage'),
    deps.requireOperationalAccess,
    requireWarehousesModule,
    requireWarehouseDeleteAllowed,
    (req, res, next) => {
      void controller.deleteWarehouse(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerLocationsRoutes,
};
