const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createExpensesController(deps) {
  return {
    async listExpenseCategories(req, res, next) {
      try {
        const data = await deps.accountsService.listExpenseCategories(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createExpenseCategory(req, res, next) {
      try {
        const data = await deps.accountsService.createExpenseCategory(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateExpenseCategory(req, res, next) {
      try {
        const data = await deps.accountsService.updateExpenseCategory(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listExpenses(req, res, next) {
      try {
        const data = await deps.accountsService.listExpenses(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createExpenseDraft(req, res, next) {
      try {
        const data = await deps.accountsService.createExpenseDraft(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async getExpense(req, res, next) {
      try {
        const data = await deps.accountsService.getExpense(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async updateExpenseDraft(req, res, next) {
      try {
        const data = await deps.accountsService.updateExpenseDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postExpense(req, res, next) {
      try {
        const result = await deps.accountsService.postExpense(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async correctExpense(req, res, next) {
      try {
        const result = await deps.accountsService.correctExpense(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createExpensesController,
};
