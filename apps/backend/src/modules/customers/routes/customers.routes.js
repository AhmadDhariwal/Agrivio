const { Router } = require('express');
const { API_CUSTOMERS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createCustomersController } = require('../controllers/customers.controller');

function registerCustomersRoutes(deps) {
  const router = Router();
  const controller = createCustomersController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_CUSTOMERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('customers.view'),
    deps.requireOperationalAccess,
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
    (req, res, next) => {
      void controller.postOpeningBalance(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerCustomersRoutes,
};
