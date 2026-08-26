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
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerAccountsRoutes(deps) {
  const router = Router();
  const controller = createAccountsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireAccountsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts',
    'enabled',
  );
  const requireCreate = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.create',
    'allowed',
  );
  const requireInspect = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.inspect',
    'allowed',
  );
  const requireDelete = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.delete',
    'allowed',
  );
  const requireOpeningBalance = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.postOpeningBalance',
    'allowed',
  );
  const requireMovementHistory = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.features.movementHistory',
    'enabled',
  );
  const requireManualMovement = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.postManualMovement',
    'allowed',
  );
  const requireMovementReversal = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.reverseMovement',
    'allowed',
  );
  const requireTransfer = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.transfer',
    'allowed',
  );
  const requireTransferReversal = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.actions.reverseTransfer',
    'allowed',
  );

  const requireKpiCards = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'accounts.features.kpiCards',
    'enabled',
  );

  router.get(
    API_ACCOUNTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    requireAccountsModule,
    (req, res, next) => {
      void controller.listAccounts(req, res, next);
    },
  );

  router.get(
    `${API_ACCOUNTS_PATH}/summary`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.view'),
    deps.requireOperationalAccess,
    requireAccountsModule,
    requireKpiCards,
    (req, res, next) => {
      void controller.getAccountsSummary(req, res, next);
    },
  );

  router.post(
    API_ACCOUNTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.manage'),
    deps.requireOperationalAccess,
    requireAccountsModule,
    requireCreate,
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
    requireAccountsModule,
    requireInspect,
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
    requireAccountsModule,
    (req, res, next) => {
      void controller.updateAccount(req, res, next);
    },
  );

  router.delete(
    `${API_ACCOUNTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.manage'),
    deps.requireOperationalAccess,
    requireAccountsModule,
    requireDelete,
    (req, res, next) => {
      void controller.deleteAccount(req, res, next);
    },
  );

  router.post(
    `${API_ACCOUNTS_PATH}/:id/opening-balance`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('accounts.opening-balance.post'),
    deps.requireOperationalAccess,
    requireAccountsModule,
    requireOpeningBalance,
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
    requireAccountsModule,
    requireMovementHistory,
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
    requireAccountsModule,
    requireManualMovement,
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
    requireAccountsModule,
    requireInspect,
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
    requireAccountsModule,
    requireMovementReversal,
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
    requireAccountsModule,
    requireTransfer,
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
    requireAccountsModule,
    requireTransferReversal,
    (req, res, next) => {
      void controller.reverseAccountTransfer(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerAccountsRoutes,
};
