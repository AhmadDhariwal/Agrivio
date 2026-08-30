const { Router } = require('express');
const { API_EXPENSE_CATEGORIES_PATH, API_EXPENSES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createExpensesController } = require('../controllers/expenses.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerExpensesRoutes(deps) {
  const router = Router();
  const controller = createExpensesController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireExpensesModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses',
    'enabled',
  );
  const requireExpensePost = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses.actions.post',
    'allowed',
  );
  const requireExpenseCorrect = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses.actions.correct',
    'allowed',
  );
  const requireExpenseInspect = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses.actions.inspect',
    'allowed',
  );
  const requireExpenseManageCategories = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses.actions.manageCategories',
    'allowed',
  );
  const requireExpenseCategories = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'expenses.categories',
    'enabled',
  );

  router.get(
    API_EXPENSE_CATEGORIES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.view'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseCategories,
    (req, res, next) => {
      void controller.listExpenseCategories(req, res, next);
    },
  );

  router.post(
    API_EXPENSE_CATEGORIES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseCategories,
    requireExpenseManageCategories,
    (req, res, next) => {
      void controller.createExpenseCategory(req, res, next);
    },
  );

  router.patch(
    `${API_EXPENSE_CATEGORIES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseCategories,
    requireExpenseManageCategories,
    (req, res, next) => {
      void controller.updateExpenseCategory(req, res, next);
    },
  );

  router.delete(
    `${API_EXPENSE_CATEGORIES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseCategories,
    requireExpenseManageCategories,
    (req, res, next) => {
      void controller.deleteExpenseCategory(req, res, next);
    },
  );

  router.get(
    API_EXPENSES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.view'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    (req, res, next) => {
      void controller.listExpenses(req, res, next);
    },
  );

  router.post(
    API_EXPENSES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpensePost,
    (req, res, next) => {
      void controller.createExpenseDraft(req, res, next);
    },
  );

  router.get(
    `${API_EXPENSES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.view'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseInspect,
    (req, res, next) => {
      void controller.getExpense(req, res, next);
    },
  );

  router.patch(
    `${API_EXPENSES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpensePost,
    (req, res, next) => {
      void controller.updateExpenseDraft(req, res, next);
    },
  );

  router.delete(
    `${API_EXPENSES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    (req, res, next) => {
      void controller.discardExpense(req, res, next);
    },
  );

  router.post(
    `${API_EXPENSES_PATH}/:id/post`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.post'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpensePost,
    (req, res, next) => {
      void controller.postExpense(req, res, next);
    },
  );

  router.post(
    `${API_EXPENSES_PATH}/:id/correct`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.correct'),
    deps.requireOperationalAccess,
    requireExpensesModule,
    requireExpenseCorrect,
    (req, res, next) => {
      void controller.correctExpense(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerExpensesRoutes,
};
