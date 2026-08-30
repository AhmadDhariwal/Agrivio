const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');
const { parseMasterStatusQuery } = require('../../../platform/http/master-status-query');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

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
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const { items, total } = await deps.catalogService.listCategories(
          requireOrganizationId(req),
          {
            status: parseMasterStatusQuery(req.query),
            search: req.query.search || undefined,
            skip,
            pageSize,
          },
        );
        sendSuccessEnvelope(res, 200, items, { page, pageSize, total });
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

    async deleteCategory(req, res, next) {
      try {
        const data = await deps.catalogService.deleteCategory(
          requireOrganizationId(req),
          String(req.params.id),
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
        const search = typeof req.query.search === 'string' ? req.query.search : '';
        // POS/autocomplete: limit param without page/pageSize triggers unbounded path
        const limitRaw = req.query.limit;
        const limit =
          typeof limitRaw === 'string' && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
        // Pagination applies when page or pageSize is present, or when limit is absent
        let page, pageSize, skip;
        if (limit !== undefined && req.query.page === undefined && req.query.pageSize === undefined) {
          // POS path — no pagination meta
          page = undefined;
          pageSize = undefined;
          skip = undefined;
        } else {
          const parsed = parsePaginationQuery(req.query);
          page = parsed.page;
          pageSize = parsed.pageSize;
          skip = parsed.skip;
        }
        const { items, total } = await deps.catalogService.listProducts(
          requireOrganizationId(req),
          { q, search, limit, status: parseMasterStatusQuery(req.query), skip, pageSize },
        );
        const includeListSummary =
          req.query.includeListSummary === 'true' || req.query.includeListSummary === true;
        const resolvedItems =
          includeListSummary && deps.inventoryReader
            ? await deps.catalogService.attachProductListSummaries(
                requireOrganizationId(req),
                items,
                deps.inventoryReader,
              )
            : items;
        if (page !== undefined) {
          sendSuccessEnvelope(res, 200, resolvedItems, { page, pageSize, total });
        } else {
          sendSuccessEnvelope(res, 200, resolvedItems);
        }
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

    async deleteProduct(req, res, next) {
      try {
        const data = await deps.catalogService.deleteProduct(
          requireOrganizationId(req),
          String(req.params.id),
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
