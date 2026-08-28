const { Router } = require('express');
const {
  API_SUPPLIER_PAYMENTS_PATH,
  API_CUSTOMER_PAYMENTS_PATH,
  API_SUPPLIERS_PATH,
  API_CUSTOMERS_PATH,
  API_PAYMENTS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createPaymentsController } = require('../controllers/payments.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

const API_SUPPLIER_LEDGER_SUPPLIERS_PATH = '/api/v1/supplier-ledger/suppliers';

function registerPaymentsRoutes(deps) {
  const router = Router();
  const controller = createPaymentsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireCustomerPaymentsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'payments.customer',
    'enabled',
  );
  const requireCustomerPaymentsAction = (action) =>
    createRequireCapabilityMiddleware(
      deps.capabilityService,
      `payments.customer.actions.${action}`,
      'allowed',
    );
  const requireSupplierPaymentsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'payments.supplier',
    'enabled',
  );
  const requireSupplierPaymentsAction = (action) =>
    createRequireCapabilityMiddleware(
      deps.capabilityService,
      `payments.supplier.actions.${action}`,
      'allowed',
    );
  const requireSupplierLedgerModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'payments.supplierLedger',
    'enabled',
  );
  const requireSupplierLedgerFeature = (feature) =>
    createRequireCapabilityMiddleware(
      deps.capabilityService,
      `payments.supplierLedger.features.${feature}`,
      'enabled',
    );

  router.get(
    API_SUPPLIER_LEDGER_SUPPLIERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    requireSupplierLedgerModule,
    (req, res, next) => {
      void controller.listSupplierLedgerSuppliers(req, res, next);
    },
  );

  router.get(
    API_SUPPLIER_PAYMENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('supplier-payments.view'),
    deps.requireOperationalAccess,
    requireSupplierPaymentsModule,
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
    requireSupplierPaymentsModule,
    requireSupplierPaymentsAction('post'),
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
    requireSupplierPaymentsModule,
    requireSupplierPaymentsAction('inspect'),
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
    requireSupplierLedgerModule,
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
    requireSupplierPaymentsModule,
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
    requireSupplierLedgerModule,
    requireSupplierLedgerFeature('reconciliationSummary'),
    (req, res, next) => {
      void controller.reconcileSupplierLedger(req, res, next);
    },
  );

  router.get(
    API_CUSTOMER_PAYMENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customer-payments.view'),
    deps.requireOperationalAccess,
    requireCustomerPaymentsModule,
    (req, res, next) => {
      void controller.listCustomerPayments(req, res, next);
    },
  );

  router.post(
    API_CUSTOMER_PAYMENTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customer-payments.post'),
    deps.requireOperationalAccess,
    requireCustomerPaymentsModule,
    requireCustomerPaymentsAction('post'),
    (req, res, next) => {
      void controller.postCustomerPayment(req, res, next);
    },
  );

  router.get(
    `${API_CUSTOMER_PAYMENTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customer-payments.view'),
    deps.requireOperationalAccess,
    requireCustomerPaymentsModule,
    requireCustomerPaymentsAction('inspect'),
    (req, res, next) => {
      void controller.getCustomerPayment(req, res, next);
    },
  );

  router.get(
    `${API_CUSTOMERS_PATH}/:id/ledger`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customer-payments.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listCustomerLedger(req, res, next);
    },
  );

  router.post(
    `${API_PAYMENTS_PATH}/:id/correct`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('payments.correct'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.correctPayment(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerPaymentsRoutes,
};
