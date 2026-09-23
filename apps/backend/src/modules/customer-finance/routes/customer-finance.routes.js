const { Router } = require('express');
const {
  API_CUSTOMER_LOANS_PATH,
  API_CUSTOMER_LOAN_REPAYMENTS_PATH,
  API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH,
} = require('@agrivio/api-contracts');
const { createRequireOrganizationContextMiddleware, createRequirePermissionMiddleware } = require('../../identity/permission.middleware');
const { createCustomerFinanceController } = require('../controllers/customer-finance.controller');

function registerCustomerFinanceRoutes(deps) {
  const router = Router(); const controller = createCustomerFinanceController(deps); const context = createRequireOrganizationContextMiddleware();
  const read = [deps.requireAuth, context, createRequirePermissionMiddleware('customers.view'), deps.requireOperationalAccess];
  const write = [deps.requireAuth, deps.requireCsrf, context, createRequirePermissionMiddleware('customers.manage'), deps.requireOperationalAccess];
  const moneyWrite = [...write, createRequirePermissionMiddleware('accounts.transaction.post')];
  router.get(API_CUSTOMER_LOANS_PATH, ...read, (req,res,next) => void controller.listLoans(req,res,next));
  router.post(API_CUSTOMER_LOANS_PATH, ...moneyWrite, (req,res,next) => void controller.createLoan(req,res,next));
  router.get(`${API_CUSTOMER_LOANS_PATH}/:id`, ...read, (req,res,next) => void controller.getLoan(req,res,next));
  router.post(`${API_CUSTOMER_LOANS_PATH}/:id/repayments`, ...moneyWrite, (req,res,next) => void controller.repayLoan(req,res,next));
  router.post(`${API_CUSTOMER_LOANS_PATH}/:id/reverse`, ...moneyWrite, (req,res,next) => void controller.reverseLoan(req,res,next));
  router.post(`${API_CUSTOMER_LOAN_REPAYMENTS_PATH}/:id/reverse`, ...moneyWrite, (req,res,next) => void controller.reverseRepayment(req,res,next));
  router.post(API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH, ...write, (req,res,next) => void controller.adjustBalance(req,res,next));
  router.post(`${API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH}/:id/reverse`, ...write, (req,res,next) => void controller.reverseAdjustment(req,res,next));
  return router;
}
module.exports = { registerCustomerFinanceRoutes };
