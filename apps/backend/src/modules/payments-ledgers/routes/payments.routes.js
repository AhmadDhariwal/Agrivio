const { Router } = require('express');
const { API_SUPPLIER_PAYMENTS_PATH, API_SUPPLIERS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createPaymentsController } = require('../controllers/payments.controller');

function registerPaymentsRoutes(deps) {
  const router = Router();
  const controller = createPaymentsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_SUPPLIER_PAYMENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listSupplierPayments(req, res, next);
    },
  );

  router.post(
    API_SUPPLIER_PAYMENTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postSupplierPayment(req, res, next);
    },
  );

  router.get(
    `${API_SUPPLIER_PAYMENTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getSupplierPayment(req, res, next);
    },
  );

  router.get(
    `${API_SUPPLIERS_PATH}/:id/ledger`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listSupplierLedger(req, res, next);
    },
  );

  router.get(
    `${API_SUPPLIERS_PATH}/:id/unpaid-purchases`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listUnpaidPurchasesForSupplier(req, res, next);
    },
  );

  router.get(
    `${API_SUPPLIERS_PATH}/:id/reconciliation`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reconcileSupplierLedger(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerPaymentsRoutes,
};
