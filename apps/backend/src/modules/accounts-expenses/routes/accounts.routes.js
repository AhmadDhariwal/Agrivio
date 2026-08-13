const { Router } = require('express');
const {
  API_ACCOUNTS_PATH,
  API_ACCOUNT_TRANSACTIONS_PATH,
  API_ACCOUNT_TRANSFERS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createAccountsController } = require('../controllers/accounts.controller');

function registerAccountsRoutes(deps) {
  const router = Router();
  const controller = createAccountsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_ACCOUNTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listAccounts(req, res, next);
    },
  );

  router.post(
    API_ACCOUNTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createAccount(req, res, next);
    },
  );

  router.get(
    `${API_ACCOUNTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getAccount(req, res, next);
    },
  );

  router.patch(
    `${API_ACCOUNTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateAccount(req, res, next);
    },
  );

  router.post(
    `${API_ACCOUNTS_PATH}/:id/opening-balance`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.opening-balance.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postOpeningBalance(req, res, next);
    },
  );

  router.get(
    `${API_ACCOUNTS_PATH}/:id/movements`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listAccountMovements(req, res, next);
    },
  );

  router.post(
    API_ACCOUNT_TRANSACTIONS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.transaction.post'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postManualAccountTransaction(req, res, next);
    },
  );

  router.get(
    `${API_ACCOUNT_TRANSACTIONS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getManualAccountTransaction(req, res, next);
    },
  );

  router.post(
    `${API_ACCOUNT_TRANSACTIONS_PATH}/:id/reverse`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.transaction.correct'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reverseManualAccountTransaction(req, res, next);
    },
  );

  router.post(
    API_ACCOUNT_TRANSFERS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.transfer'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.postAccountTransfer(req, res, next);
    },
  );

  router.post(
    `${API_ACCOUNT_TRANSFERS_PATH}/:id/reverse`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.transfer.reverse'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.reverseAccountTransfer(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerAccountsRoutes,
};
