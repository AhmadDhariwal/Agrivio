const { Router } = require('express');
const { API_EXPENSE_CATEGORIES_PATH, API_EXPENSES_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createExpensesController } = require('../controllers/expenses.controller');

function registerExpensesRoutes(deps) {
  const router = Router();
  const controller = createExpensesController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    API_EXPENSE_CATEGORIES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('expenses.view'),
    deps.requireOperationalAccess,
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
    (req, res, next) => {
      void controller.correctExpense(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerExpensesRoutes,
};
