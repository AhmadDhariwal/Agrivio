const { Router } = require('express');
const {
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_INVENTORY_EXPIRY_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_INVENTORY_RECONCILIATION_PATH,
  API_STOCK_ADJUSTMENTS_PATH,
  API_WAREHOUSE_TRANSFERS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
  createRequireWarehouseAccessMiddleware,
} = require('../../identity/permission.middleware');
const { createInventoryController } = require('../controllers/inventory.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerInventoryRoutes(deps) {
  const router = Router();
  const controller = createInventoryController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireStockModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'inventory.stock',
    'enabled',
  );

  router.get(
    API_INVENTORY_BALANCES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    requireStockModule,
    (req, res, next) => {
      void controller.listBalances(req, res, next);
    },
  );

  router.get(
    API_INVENTORY_MOVEMENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listMovements(req, res, next);
    },
  );

  router.get(
    API_INVENTORY_BATCHES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listBatches(req, res, next);
    },
  );

  router.get(
    `${API_INVENTORY_BATCHES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getBatch(req, res, next);
    },
  );

  router.get(
    API_INVENTORY_EXPIRY_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.expiry.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.queryExpiry(req, res, next);
    },
  );

  router.get(
    API_INVENTORY_RECONCILIATION_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reconcileInventory(req, res, next);
    },
  );

  router.post(
    API_INVENTORY_OPENING_STOCK_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.opening-stock.post'),
    deps.requireOperationalAccess,
    createRequireWarehouseAccessMiddleware(),
    (req, res, next) => {
      void controller.postOpeningStock(req, res, next);
    },
  );

  router.get(
    API_STOCK_ADJUSTMENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listAdjustments(req, res, next);
    },
  );

  router.post(
    API_STOCK_ADJUSTMENTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.adjust'),
    deps.requireOperationalAccess,
    createRequireWarehouseAccessMiddleware(),
    (req, res, next) => {
      void controller.createAdjustment(req, res, next);
    },
  );

  router.get(
    `${API_STOCK_ADJUSTMENTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getAdjustment(req, res, next);
    },
  );

  router.patch(
    `${API_STOCK_ADJUSTMENTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.adjust'),
    deps.requireOperationalAccess,
    createRequireWarehouseAccessMiddleware(),
    (req, res, next) => {
      void controller.updateAdjustment(req, res, next);
    },
  );

  router.delete(
    `${API_STOCK_ADJUSTMENTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.adjust'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.discardAdjustment(req, res, next);
    },
  );

  router.post(
    `${API_STOCK_ADJUSTMENTS_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.adjust'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postAdjustment(req, res, next);
    },
  );

  router.post(
    `${API_STOCK_ADJUSTMENTS_PATH}/:id/reverse`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.adjust.reverse'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reverseAdjustment(req, res, next);
    },
  );

  router.get(
    API_WAREHOUSE_TRANSFERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listTransfers(req, res, next);
    },
  );

  router.post(
    API_WAREHOUSE_TRANSFERS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.transfer'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createTransfer(req, res, next);
    },
  );

  router.get(
    `${API_WAREHOUSE_TRANSFERS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getTransfer(req, res, next);
    },
  );

  router.patch(
    `${API_WAREHOUSE_TRANSFERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.transfer'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateTransfer(req, res, next);
    },
  );

  router.delete(
    `${API_WAREHOUSE_TRANSFERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.transfer'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.discardTransfer(req, res, next);
    },
  );

  router.post(
    `${API_WAREHOUSE_TRANSFERS_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.transfer'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postTransfer(req, res, next);
    },
  );

  router.post(
    `${API_WAREHOUSE_TRANSFERS_PATH}/:id/reverse`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('inventory.transfer.reverse'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reverseTransfer(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerInventoryRoutes,
};
