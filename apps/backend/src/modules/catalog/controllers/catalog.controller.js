const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function createCatalogController(deps) {
  return {
    async listCategories(req, res, next) {
      try {
        const data = await deps.catalogService.listCategories(requireOrganizationId(req));
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getCategory(req, res, next) {
      try {
        const data = await deps.catalogService.getCategory(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createCategory(req, res, next) {
      try {
        const data = await deps.catalogService.createCategory(requireOrganizationId(req), req.body, {
          actorId: String(req.authContext.userId),
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateCategory(req, res, next) {
      try {
        const data = await deps.catalogService.updateCategory(
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

    async listProducts(req, res, next) {
      try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const limitRaw = req.query.limit;
        const limit =
          typeof limitRaw === 'string' && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
        const data = await deps.catalogService.listProducts(requireOrganizationId(req), {
          q,
          limit,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getProduct(req, res, next) {
      try {
        const data = await deps.catalogService.getProduct(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async createProduct(req, res, next) {
      try {
        const data = await deps.catalogService.createProduct(requireOrganizationId(req), req.body, {
          actorId: String(req.authContext.userId),
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async updateProduct(req, res, next) {
      try {
        const data = await deps.catalogService.updateProduct(
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

    async listPackagingUnits(req, res, next) {
      try {
        const data = await deps.catalogService.listPackagingUnits(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async replacePackagingUnits(req, res, next) {
      try {
        const data = await deps.catalogService.replacePackagingUnits(
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

    async listPrices(req, res, next) {
      try {
        const data = await deps.catalogService.listPrices(
          requireOrganizationId(req),
          String(req.params.id),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async replacePrices(req, res, next) {
      try {
        const data = await deps.catalogService.replacePrices(
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
  };
}

module.exports = {
  createCatalogController,
};
