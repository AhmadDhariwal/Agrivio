const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound } = require('../../platform/errors/app-error');
const {
  assertCreationLimit,
  attachSoftWarning,
} = require('../subscriptions/creation-limit');
const {
  parseCategoryCreate,
  parseCategoryPatch,
  parseProductCreate,
  parseProductPatch,
  parsePackagingUnitsReplace,
  parsePriceCreate,
  parsePricesReplace,
  assertTrackingModeAllowed,
  toCategoryDto,
  toProductDto,
  toPackagingUnitDto,
  toProductPriceDto,
} = require('./catalog.validation');
const { createInMemoryCatalogStore, createMongooseCatalogStore } = require('./catalog.store');

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function createCatalogService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function requireCategory(organizationId, categoryId) {
    const category = await store.findCategoryById(organizationId, categoryId);
    if (category === null) {
      throw notFound('Category not found');
    }
    return category;
  }

  async function requireProduct(organizationId, productId) {
    const product = await store.findProductById(organizationId, productId);
    if (product === null) {
      throw notFound('Product not found');
    }
    return product;
  }

  return {
    async listCategories(organizationId, options = {}) {
      const items = await store.listCategories(organizationId);
      const filtered =
        options.status === 'active' || options.status === 'inactive'
          ? items.filter((item) => String(item.status) === options.status)
          : items;
      return { items: filtered.map(toCategoryDto) };
    },

    async getCategory(organizationId, categoryId) {
      return toCategoryDto(await requireCategory(organizationId, categoryId));
    },

    async findCategoryByName(organizationId, name) {
      const needle = String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return null;
      }
      const items = await store.listCategories(organizationId);
      const found = items.find((item) => String(item.nameNormalized) === needle);
      return found ? toCategoryDto(found) : null;
    },

    async findProductBySku(organizationId, sku) {
      const needle = String(sku ?? '')
        .trim()
        .toUpperCase();
      if (needle === '') {
        return null;
      }
      if (typeof store.findProductBySku === 'function') {
        const found = await store.findProductBySku(organizationId, needle);
        return found ? toProductDto(found) : null;
      }
      const items = await store.listProducts(organizationId);
      const found = items.find((item) => String(item.sku ?? '').toUpperCase() === needle);
      return found ? toProductDto(found) : null;
    },

    async findPrice(organizationId, productId, priceTier) {
      const items = await store.listPrices(organizationId, productId);
      const found = items.find((item) => item.priceTier === priceTier);
      return found ? toProductPriceDto(found) : null;
    },

    async createCategory(organizationId, body, actor, options = {}) {
      const input = parseCategoryCreate(body);
      try {
        return await transactionRunner.runWithOptionalSession(options.session, async (session) => {
          const created = await store.insertCategory(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product_category.created',
            resourceType: 'product_category',
            resourceId: String(created['_id']),
            metadata: { productClass: created.productClass },
          });
          return toCategoryDto(created);
        });
      } catch (error) {
        mapDuplicate(error, 'Category name already exists in this organization');
      }
    },

    async updateCategory(organizationId, categoryId, body, actor) {
      const { expectedVersion, patch } = parseCategoryPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await requireCategory(organizationId, categoryId);
          assertOptimisticVersion(current, expectedVersion);
          const nextProductClass = patch.productClass ?? current.productClass;
          if (patch.productClass !== undefined || patch.status !== undefined) {
            // no-op guard for future product revalidation hooks
            void nextProductClass;
          }
          const updated = await store.updateCategory(session, organizationId, categoryId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product_category.updated',
            resourceType: 'product_category',
            resourceId: categoryId,
            metadata: { fields: Object.keys(patch) },
          });
          return toCategoryDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Category name already exists in this organization');
      }
    },

    async listProductCategoryMap(organizationId) {
      if (typeof store.listProductCategoryPairs === 'function') {
        const items = await store.listProductCategoryPairs(organizationId);
        return new Map(items.map((item) => [String(item.id), String(item.categoryId)]));
      }
      const listed = await store.listProducts(organizationId);
      return new Map(
        listed.map((item) => [String(item._id ?? item.id), String(item.categoryId)]),
      );
    },

    async listProducts(organizationId, options = {}) {
      const items = await store.listProducts(organizationId, options);
      const filtered =
        options.status === 'active' || options.status === 'inactive'
          ? items.filter((item) => String(item.status) === options.status)
          : items;
      return { items: filtered.map(toProductDto) };
    },

    async getProduct(organizationId, productId) {
      return toProductDto(await requireProduct(organizationId, productId));
    },

    async createProduct(organizationId, body, actor, options = {}) {
      const input = parseProductCreate(body);
      const category = await requireCategory(organizationId, input.categoryId);
      assertTrackingModeAllowed(category.productClass, input.trackingMode);
      const currentUsage = await store.countProducts(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'products',
        currentUsage,
      );

      try {
        return await transactionRunner.runWithOptionalSession(options.session, async (session) => {
          const created = await store.insertProduct(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product.created',
            resourceType: 'product',
            resourceId: String(created['_id']),
            metadata: {
              trackingMode: created.trackingMode,
              baseUnitCode: created.baseUnitCode,
            },
          });
          const dto = toProductDto(created);
          return attachSoftWarning(dto, entitlement);
        });
      } catch (error) {
        mapDuplicate(error, 'Product SKU already exists in this organization');
      }
    },

    async updateProduct(organizationId, productId, body, actor) {
      const { expectedVersion, patch } = parseProductPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await requireProduct(organizationId, productId);
          assertOptimisticVersion(current, expectedVersion);
          const categoryId = patch.categoryId ?? String(current.categoryId);
          const category = await requireCategory(organizationId, categoryId);
          const trackingMode = patch.trackingMode ?? current.trackingMode;
          assertTrackingModeAllowed(category.productClass, trackingMode);
          const updated = await store.updateProduct(session, organizationId, productId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product.updated',
            resourceType: 'product',
            resourceId: productId,
            metadata: { fields: Object.keys(patch) },
          });
          return toProductDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Product SKU already exists in this organization');
      }
    },

    async listPackagingUnits(organizationId, productId) {
      await requireProduct(organizationId, productId);
      const items = await store.listPackagingUnits(organizationId, productId);
      return { items: items.map(toPackagingUnitDto) };
    },

    async replacePackagingUnits(organizationId, productId, body, actor) {
      const { expectedVersion, items } = parsePackagingUnitsReplace(body);
      try {
        return await transactionRunner.run(async (session) => {
          const product = await requireProduct(organizationId, productId);
          assertOptimisticVersion(product, expectedVersion);
          const existing = await store.listPackagingUnits(organizationId, productId);
          const desiredKeys = new Set(items.map((item) => item.nameNormalized));

          for (const unit of existing) {
            if (!desiredKeys.has(unit.nameNormalized) && unit.status === 'active') {
              await store.updatePackagingUnit(session, organizationId, String(unit['_id']), {
                status: 'inactive',
                version: Number(unit['version'] ?? 1) + 1,
              });
            }
          }

          for (const item of items) {
            const found = existing.find((unit) => unit.nameNormalized === item.nameNormalized);
            if (found === undefined) {
              await store.insertPackagingUnit(session, {
                organizationId,
                productId,
                ...item,
                version: 1,
              });
            } else {
              await store.updatePackagingUnit(session, organizationId, String(found['_id']), {
                name: item.name,
                nameNormalized: item.nameNormalized,
                conversionFactor: item.conversionFactor,
                status: item.status,
                version: Number(found['version'] ?? 1) + 1,
              });
            }
          }

          await store.updateProduct(session, organizationId, productId, {
            version: Number(product['version']) + 1,
          });

          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product.packaging_units.replaced',
            resourceType: 'product',
            resourceId: productId,
            metadata: { count: items.length },
          });

          const next = await store.listPackagingUnits(organizationId, productId);
          return {
            productId,
            productVersion: Number(product['version']) + 1,
            items: next.map(toPackagingUnitDto),
          };
        });
      } catch (error) {
        mapDuplicate(error, 'Packaging unit identity already exists for this product');
      }
    },

    async listPrices(organizationId, productId) {
      await requireProduct(organizationId, productId);
      const items = await store.listPrices(organizationId, productId);
      return { items: items.map(toProductPriceDto) };
    },

    async createPrice(organizationId, productId, body, actor, options = {}) {
      const input = parsePriceCreate(body);
      try {
        return await transactionRunner.runWithOptionalSession(options.session, async (session) => {
          await requireProduct(organizationId, productId);
          const existing = await store.listPrices(organizationId, productId);
          if (existing.some((item) => item.priceTier === input.priceTier)) {
            throw conflict('Price tier already exists for this product');
          }
          const created = await store.insertPrice(session, {
            organizationId,
            productId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product.price.created',
            resourceType: 'product_price',
            resourceId: String(created['_id']),
            metadata: { productId, priceTier: input.priceTier },
          });
          return toProductPriceDto(created);
        });
      } catch (error) {
        mapDuplicate(error, 'Price tier already exists for this product');
      }
    },

    async replacePrices(organizationId, productId, body, actor) {
      const { expectedVersion, items } = parsePricesReplace(body);
      try {
        return await transactionRunner.run(async (session) => {
          const product = await requireProduct(organizationId, productId);
          assertOptimisticVersion(product, expectedVersion);
          const existing = await store.listPrices(organizationId, productId);
          const desiredTiers = new Set(items.map((item) => item.priceTier));

          for (const price of existing) {
            if (!desiredTiers.has(price.priceTier) && price.status === 'active') {
              await store.updatePrice(session, organizationId, String(price['_id']), {
                status: 'inactive',
                version: Number(price['version'] ?? 1) + 1,
              });
            }
          }

          for (const item of items) {
            const found = existing.find((price) => price.priceTier === item.priceTier);
            if (found === undefined) {
              await store.insertPrice(session, {
                organizationId,
                productId,
                ...item,
                version: 1,
              });
            } else {
              await store.updatePrice(session, organizationId, String(found['_id']), {
                amountMinorUnits: item.amountMinorUnits,
                currency: item.currency,
                status: item.status,
                version: Number(found['version'] ?? 1) + 1,
              });
            }
          }

          await store.updateProduct(session, organizationId, productId, {
            version: Number(product['version']) + 1,
          });

          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'product.prices.replaced',
            resourceType: 'product',
            resourceId: productId,
            metadata: { tiers: items.map((item) => item.priceTier) },
          });

          const next = await store.listPrices(organizationId, productId);
          return {
            productId,
            productVersion: Number(product['version']) + 1,
            items: next.map(toProductPriceDto),
          };
        });
      } catch (error) {
        mapDuplicate(error, 'Price tier already exists for this product');
      }
    },
  };
}

function createCatalogModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseCatalogStore() : createInMemoryCatalogStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const catalogService = createCatalogService({
    store,
    transactionRunner,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
  });

  return {
    store,
    catalogService,
  };
}

module.exports = {
  createCatalogService,
  createCatalogModule,
  createInMemoryCatalogStore,
  createMongooseCatalogStore,
};
