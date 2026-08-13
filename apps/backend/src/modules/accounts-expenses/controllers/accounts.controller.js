const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createAccountsController(deps) {
  return {
    async listAccounts(req, res, next) {
      try {
        const data = await deps.accountsService.listAccounts(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getAccount(req, res, next) {
      try {
        const data = await deps.accountsService.getAccount(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createAccount(req, res, next) {
      try {
        const data = await deps.accountsService.createAccount(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateAccount(req, res, next) {
      try {
        const data = await deps.accountsService.updateAccount(
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

    async postOpeningBalance(req, res, next) {
      try {
        const result = await deps.accountsService.postOpeningBalance(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 201, result.data);
      } catch (error) {
        next(error);
      }
    },

    async listAccountMovements(req, res, next) {
      try {
        const data = await deps.accountsService.listAccountMovements(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postManualAccountTransaction(req, res, next) {
      try {
        const result = await deps.accountsService.postManualAccountTransaction(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 201, result.data);
      } catch (error) {
        next(error);
      }
    },

    async getManualAccountTransaction(req, res, next) {
      try {
        const data = await deps.accountsService.getManualAccountTransaction(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async reverseManualAccountTransaction(req, res, next) {
      try {
        const result = await deps.accountsService.reverseManualAccountTransaction(
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

    async postAccountTransfer(req, res, next) {
      try {
        const result = await deps.accountsService.postAccountTransfer(
          requireOrganizationId(req),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 201, result.data);
      } catch (error) {
        next(error);
      }
    },

    async reverseAccountTransfer(req, res, next) {
      try {
        const result = await deps.accountsService.reverseAccountTransfer(
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
  createAccountsController,
};
