const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createInventoryController(deps) {
  return {
    async listBalances(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.inventoryService.listBalances(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async listMovements(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.inventoryService.listMovements(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async listBatches(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.inventoryService.listBatches(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async getBatch(req, res, next) {
      try {
        const data = await deps.inventoryService.getBatch(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async queryExpiry(req, res, next) {
      try {
        const data = await deps.inventoryService.queryExpiry(
          requireOrganizationId(req),
          req.query,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postOpeningStock(req, res, next) {
      try {
        const result = await deps.inventoryService.postOpeningStock(
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

    async listAdjustments(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.inventoryService.listAdjustments(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async createAdjustment(req, res, next) {
      try {
        const data = await deps.inventoryService.createAdjustmentDraft(
          requireOrganizationId(req),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async getAdjustment(req, res, next) {
      try {
        const data = await deps.inventoryService.getAdjustment(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async updateAdjustment(req, res, next) {
      try {
        const data = await deps.inventoryService.updateAdjustmentDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async discardAdjustment(req, res, next) {
      try {
        const data = await deps.inventoryService.discardAdjustmentDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postAdjustment(req, res, next) {
      try {
        const result = await deps.inventoryService.postAdjustment(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async reverseAdjustment(req, res, next) {
      try {
        const result = await deps.inventoryService.reverseAdjustment(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async listTransfers(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.inventoryService.listTransfers(
          requireOrganizationId(req),
          { ...req.query, skip, pageSize },
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
      } catch (error) {
        next(error);
      }
    },

    async createTransfer(req, res, next) {
      try {
        const data = await deps.inventoryService.createTransferDraft(
          requireOrganizationId(req),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async getTransfer(req, res, next) {
      try {
        const data = await deps.inventoryService.getTransfer(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async updateTransfer(req, res, next) {
      try {
        const data = await deps.inventoryService.updateTransferDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async discardTransfer(req, res, next) {
      try {
        const data = await deps.inventoryService.discardTransferDraft(
          requireOrganizationId(req),
          String(req.params.id),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async postTransfer(req, res, next) {
      try {
        const result = await deps.inventoryService.postTransfer(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async reverseTransfer(req, res, next) {
      try {
        const result = await deps.inventoryService.reverseTransfer(
          requireOrganizationId(req),
          String(req.params.id),
          req.body,
          { actorId: String(req.authContext.userId) },
          req.authContext,
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async reconcileInventory(req, res, next) {
      try {
        const data = await deps.inventoryService.reconcileInventory(
          requireOrganizationId(req),
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createInventoryController,
};
