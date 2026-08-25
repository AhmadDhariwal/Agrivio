const { Router } = require('express');
const { API_CUSTOMERS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createCustomersController } = require('../controllers/customers.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerCustomersRoutes(deps) {
  const router = Router();
  const controller = createCustomersController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireCustomersModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers',
    'enabled',
  );
  const requireCreateAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers.actions.create',
    'allowed',
  );
  const requireEditAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers.actions.edit',
    'allowed',
  );
  const requireDeleteAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers.actions.delete',
    'allowed',
  );
  const requireEditCreditPolicyAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers.actions.editCreditPolicy',
    'allowed',
  );
  const requirePostOpeningBalanceAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'customers.actions.postOpeningBalance',
    'allowed',
  );

  router.get(
    API_CUSTOMERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.view'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    (req, res, next) => {
      void controller.listCustomers(req, res, next);
    },
  );

  router.post(
    API_CUSTOMERS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.manage'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    requireCreateAllowed,
    (req, res, next) => {
      void controller.createCustomer(req, res, next);
    },
  );

  router.get(
    `${API_CUSTOMERS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.view'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    (req, res, next) => {
      void controller.getCustomer(req, res, next);
    },
  );

  router.patch(
    `${API_CUSTOMERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.manage'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    requireEditAllowed,
    (req, res, next) => {
      void controller.updateCustomer(req, res, next);
    },
  );

  router.delete(
    `${API_CUSTOMERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.manage'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    requireDeleteAllowed,
    (req, res, next) => {
      void controller.deleteCustomer(req, res, next);
    },
  );

  router.patch(
    `${API_CUSTOMERS_PATH}/:id/credit-policy`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.credit-policy.manage'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    requireEditCreditPolicyAllowed,
    (req, res, next) => {
      void controller.updateCreditPolicy(req, res, next);
    },
  );

  router.post(
    `${API_CUSTOMERS_PATH}/:id/opening-balance`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.opening-balance.post'),
    deps.requireOperationalAccess,
    requireCustomersModule,
    requirePostOpeningBalanceAllowed,
    (req, res, next) => {
      void controller.postOpeningBalance(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerCustomersRoutes,
};
