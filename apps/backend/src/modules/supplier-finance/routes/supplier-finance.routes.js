const { Router } = require('express');
const { API_SUPPLIER_REFUNDS_PATH, API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH } = require('@agrivio/api-contracts');
const { createRequireOrganizationContextMiddleware, createRequirePermissionMiddleware } = require('../../identity/permission.middleware');
const { createSupplierFinanceController } = require('../controllers/supplier-finance.controller');

function registerSupplierFinanceRoutes(deps) {
  const router = Router(); const controller = createSupplierFinanceController(deps); const context = createRequireOrganizationContextMiddleware();
  router.get(API_SUPPLIER_REFUNDS_PATH, deps.requireAuth, context, deps.requireOperationalAccess, createRequirePermissionMiddleware('supplier-payments.view'), (req, res, next) => void controller.listRefunds(req, res, next));
  router.post(API_SUPPLIER_REFUNDS_PATH, deps.requireAuth, deps.requireCsrf, context, deps.requireOperationalAccess, createRequirePermissionMiddleware('supplier-payments.post'), createRequirePermissionMiddleware('accounts.transaction.post'), (req, res, next) => void controller.postRefund(req, res, next));
  router.post(`${API_SUPPLIER_REFUNDS_PATH}/:id/reverse`, deps.requireAuth, deps.requireCsrf, context, deps.requireOperationalAccess, createRequirePermissionMiddleware('payments.correct'), createRequirePermissionMiddleware('accounts.transaction.correct'), (req, res, next) => void controller.reverseRefund(req, res, next));
  router.post(API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH, deps.requireAuth, deps.requireCsrf, context, deps.requireOperationalAccess, createRequirePermissionMiddleware('suppliers.manage'), (req, res, next) => void controller.adjustBalance(req, res, next));
  router.post(`${API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH}/:id/reverse`, deps.requireAuth, deps.requireCsrf, context, deps.requireOperationalAccess, createRequirePermissionMiddleware('suppliers.manage'), (req, res, next) => void controller.reverseAdjustment(req, res, next));
  return router;
}

module.exports = { registerSupplierFinanceRoutes };
