const mongoose = require('mongoose');
const { ProductCategoryModel } = require('./persistence/product-category.model');
const { ProductModel } = require('./persistence/product.model');
const { ProductPackagingUnitModel } = require('./persistence/product-packaging-unit.model');
const { ProductPriceModel } = require('./persistence/product-price.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function productSearchFilter(organizationId, q) {
  const filter = { organizationId };
  const raw = String(q ?? '').trim();
  if (raw === '') {
    return filter;
  }
  const sku = raw.toUpperCase();
  const name = raw.replace(/\s+/g, ' ').toLowerCase();
  filter.$or = [{ sku }, { nameNormalized: { $regex: `^${escapeRegex(name)}` } }];
  return filter;
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function markDuplicate(error) {
  if (isDuplicateKeyError(error)) {
    error.agrivioDuplicate = true;
  }
  return error;
}

function createMongooseCatalogStore() {
  return {
    async listCategories(organizationId, filter = {}, pagination = {}) {
      const query = { organizationId };
      if (filter.status === 'active' || filter.status === 'inactive') {
        query.status = filter.status;
      }
      if (filter.search) {
        const escaped = String(filter.search).trim().toLowerCase().replace(/\s+/g, ' ');
        if (escaped) {
          query.nameNormalized = { $regex: escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
        }
      }
      const hasPagination = pagination.skip !== undefined || pagination.pageSize !== undefined;
      const { skip = 0, pageSize = 25 } = pagination;
      let find = ProductCategoryModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (hasPagination) {
        find = find.skip(skip).limit(pageSize);
      }
      const [total, items] = await Promise.all([
        ProductCategoryModel.countDocuments(query).exec(),
        find.lean().exec(),
      ]);
      return { items, total };
    },

    async countCategories(organizationId) {
      return ProductCategoryModel.countDocuments({ organizationId }).exec();
    },

    async findCategoryById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return ProductCategoryModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertCategory(session, doc) {
      try {
        const [created] = await ProductCategoryModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateCategory(session, organizationId, id, patch) {
      try {
        return await ProductCategoryModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async listProducts(organizationId, options = {}, pagination = {}) {
      const filter = productSearchFilter(organizationId, options.q || options.search);
      if (options.status === 'active' || options.status === 'inactive') {
        filter.status = options.status;
      }
      // POS / autocomplete path: caller passes limit without pagination — return unbounded slice
      if (pagination.pageSize === undefined && options.limit !== undefined) {
        const limit = toPositiveInt(options.limit);
        let q = ProductModel.find(filter).sort({ createdAt: -1, _id: -1 });
        if (limit !== null) {
          q = q.limit(limit);
        }
        const items = await q.lean().exec();
        return { items, total: items.length };
      }
      const hasPagination = pagination.skip !== undefined || pagination.pageSize !== undefined;
      const { skip = 0, pageSize = 25 } = pagination;
      let find = ProductModel.find(filter).sort({ createdAt: -1, _id: -1 });
      if (hasPagination) {
        find = find.skip(skip).limit(pageSize);
      }
      const [total, items] = await Promise.all([
        ProductModel.countDocuments(filter).exec(),
        find.lean().exec(),
      ]);
      return { items, total };
    },

    async findProductBySku(organizationId, sku) {
      const needle = String(sku ?? '')
        .trim()
        .toUpperCase();
      if (needle === '') {
        return null;
      }
      try {
        return await ProductModel.findOne({ organizationId, sku: needle })
          .hint({ organizationId: 1, sku: 1 })
          .lean()
          .exec();
      } catch {
        return ProductModel.findOne({ organizationId, sku: needle }).lean().exec();
      }
    },

    async listProductCategoryPairs(organizationId) {
      const rows = await ProductModel.find({ organizationId })
        .select({ categoryId: 1 })
        .lean()
        .exec();
      return rows.map((row) => ({
        id: String(row._id),
        categoryId: String(row.categoryId),
      }));
    },

    async countProducts(organizationId) {
      return ProductModel.countDocuments({ organizationId }).exec();
    },

    async countPackagingUnits(organizationId) {
      return ProductPackagingUnitModel.countDocuments({
        organizationId,
        status: 'active',
      }).exec();
    },

    async countProductPrices(organizationId) {
      return ProductPriceModel.countDocuments({ organizationId }).exec();
    },

    async findProductById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return ProductModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertProduct(session, doc) {
      try {
        const [created] = await ProductModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateProduct(session, organizationId, id, patch) {
      try {
        return await ProductModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async deleteProduct(session, organizationId, id) {
      await ProductPackagingUnitModel.deleteMany(
        { organizationId, productId: id },
        withSession(session),
      );
      await ProductPriceModel.deleteMany({ organizationId, productId: id }, withSession(session));
      const result = await ProductModel.deleteOne(
        { _id: id, organizationId },
        withSession(session),
      );
      return result.deletedCount === 1;
    },

    async deleteCategory(session, organizationId, id) {
      const result = await ProductCategoryModel.deleteOne(
        { _id: id, organizationId },
        withSession(session),
      );
      return result.deletedCount === 1;
    },

    async listPackagingUnits(organizationId, productId) {
      return ProductPackagingUnitModel.find({ organizationId, productId })
        .sort({ nameNormalized: 1 })
        .lean()
        .exec();
    },

    async insertPackagingUnit(session, doc) {
      try {
        const [created] = await ProductPackagingUnitModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updatePackagingUnit(session, organizationId, id, patch) {
      try {
        return await ProductPackagingUnitModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async listPrices(organizationId, productId) {
      return ProductPriceModel.find({ organizationId, productId })
        .sort({ priceTier: 1 })
        .lean()
        .exec();
    },

    async listActivePricesByProductIds(organizationId, productIds) {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return [];
      }
      return ProductPriceModel.find({
        organizationId,
        productId: { $in: productIds.map(String) },
        status: 'active',
      })
        .sort({ priceTier: 1 })
        .lean()
        .exec();
    },

    async findProductsByIds(organizationId, productIds) {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return [];
      }
      const mongoose = require('mongoose');
      const ids = productIds.filter((id) => mongoose.isValidObjectId(id));
      if (ids.length === 0) {
        return [];
      }
      return ProductModel.find({ organizationId, _id: { $in: ids } })
        .lean()
        .exec();
    },

    async insertPrice(session, doc) {
      try {
        const [created] = await ProductPriceModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updatePrice(session, organizationId, id, patch) {
      try {
        return await ProductPriceModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryCatalogStore() {
  const categories = new Map();
  const products = new Map();
  const packagingUnits = new Map();
  const prices = new Map();
  const audits = [];
  let seq = 1;

  function assertUniqueCategory(organizationId, nameNormalized, excludeId) {
    for (const record of categories.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate category');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniqueSku(organizationId, sku, excludeId) {
    if (!sku) {
      return;
    }
    for (const record of products.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.sku === sku) {
        const error = new Error('Duplicate sku');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniquePackaging(organizationId, productId, nameNormalized, excludeId) {
    for (const record of packagingUnits.values()) {
      if (
        String(record.organizationId) !== String(organizationId) ||
        String(record.productId) !== String(productId)
      ) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate packaging unit');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniquePrice(organizationId, productId, priceTier, excludeId) {
    for (const record of prices.values()) {
      if (
        String(record.organizationId) !== String(organizationId) ||
        String(record.productId) !== String(productId)
      ) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.priceTier === priceTier) {
        const error = new Error('Duplicate price tier');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  return {
    async listCategories(organizationId, filter = {}, pagination = {}) {
      let all = [...categories.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      );
      if (filter.status === 'active' || filter.status === 'inactive') {
        all = all.filter((item) => String(item.status) === filter.status);
      }
      if (filter.search) {
        const needle = String(filter.search).trim().toLowerCase().replace(/\s+/g, ' ');
        if (needle) {
          all = all.filter(
            (item) => typeof item.nameNormalized === 'string' && item.nameNormalized.includes(needle),
          );
        }
      }
      const total = all.length;
      const { skip = 0, pageSize = 25 } = pagination;
      const items = all.slice(skip, skip + pageSize).map((item) => ({ ...item }));
      return { items, total };
    },

    async countCategories(organizationId) {
      return [...categories.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async findCategoryById(organizationId, id) {
      const record = categories.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertCategory(_session, doc) {
      assertUniqueCategory(doc.organizationId, doc.nameNormalized);
      const id = `category-${seq++}`;
      const record = { _id: id, ...doc };
      categories.set(id, record);
      return { ...record };
    },

    async updateCategory(_session, organizationId, id, patch) {
      const existing = await this.findCategoryById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueCategory(organizationId, next.nameNormalized, id);
      categories.set(id, next);
      return { ...next };
    },

    async listProducts(organizationId, options = {}, pagination = {}) {
      const searchQ = options.q || options.search || '';
      const needle = String(searchQ).trim().toUpperCase();
      const nameNeedle = String(searchQ).trim().replace(/\s+/g, ' ').toLowerCase();
      let all = [...products.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .filter((item) => {
          if (needle === '') {
            return true;
          }
          return (
            String(item.sku ?? '').toUpperCase() === needle ||
            String(item.nameNormalized ?? '').includes(nameNeedle)
          );
        });
      if (options.status === 'active' || options.status === 'inactive') {
        all = all.filter((item) => String(item.status) === options.status);
      }
      // POS / autocomplete path
      if (pagination.pageSize === undefined && options.limit !== undefined) {
        const limit = toPositiveInt(options.limit);
        const items = (limit !== null ? all.slice(0, limit) : all).map((item) => ({ ...item }));
        return { items, total: items.length };
      }
      const total = all.length;
      const { skip = 0, pageSize = 25 } = pagination;
      const items = all.slice(skip, skip + pageSize).map((item) => ({ ...item }));
      return { items, total };
    },

    async findProductBySku(organizationId, sku) {
      const needle = String(sku ?? '')
        .trim()
        .toUpperCase();
      if (needle === '') {
        return null;
      }
      const found = [...products.values()].find(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          String(item.sku ?? '').toUpperCase() === needle,
      );
      return found ? { ...found } : null;
    },

    async listProductCategoryPairs(organizationId) {
      return [...products.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({
          id: String(item._id),
          categoryId: String(item.categoryId),
        }));
    },

    async countProducts(organizationId) {
      return [...products.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async countPackagingUnits(organizationId) {
      return [...packagingUnits.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) && item.status === 'active',
      ).length;
    },

    async countProductPrices(organizationId) {
      return [...prices.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async findProductById(organizationId, id) {
      const record = products.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertProduct(_session, doc) {
      assertUniqueSku(doc.organizationId, doc.sku);
      const id = `product-${seq++}`;
      const record = { _id: id, ...doc };
      products.set(id, record);
      return { ...record };
    },

    async updateProduct(_session, organizationId, id, patch) {
      const existing = await this.findProductById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueSku(organizationId, next.sku, id);
      products.set(id, next);
      return { ...next };
    },

    async deleteProduct(_session, organizationId, id) {
      const existing = await this.findProductById(organizationId, id);
      if (existing === null) {
        return false;
      }
      for (const [packagingId, unit] of packagingUnits) {
        if (
          String(unit.organizationId) === String(organizationId) &&
          String(unit.productId) === String(id)
        ) {
          packagingUnits.delete(packagingId);
        }
      }
      for (const [priceId, price] of prices) {
        if (
          String(price.organizationId) === String(organizationId) &&
          String(price.productId) === String(id)
        ) {
          prices.delete(priceId);
        }
      }
      products.delete(id);
      return true;
    },

    async deleteCategory(_session, organizationId, id) {
      const existing = await this.findCategoryById(organizationId, id);
      if (existing === null) {
        return false;
      }
      categories.delete(id);
      return true;
    },

    async listPackagingUnits(organizationId, productId) {
      return [...packagingUnits.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.productId) === String(productId),
        )
        .map((item) => ({ ...item }));
    },

    async insertPackagingUnit(_session, doc) {
      assertUniquePackaging(doc.organizationId, doc.productId, doc.nameNormalized);
      const id = `packaging-${seq++}`;
      const record = { _id: id, ...doc };
      packagingUnits.set(id, record);
      return { ...record };
    },

    async updatePackagingUnit(_session, organizationId, id, patch) {
      const existing = packagingUnits.get(id);
      if (existing === undefined || String(existing.organizationId) !== String(organizationId)) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniquePackaging(organizationId, next.productId, next.nameNormalized, id);
      packagingUnits.set(id, next);
      return { ...next };
    },

    async listPrices(organizationId, productId) {
      return [...prices.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.productId) === String(productId),
        )
        .map((item) => ({ ...item }));
    },

    async listActivePricesByProductIds(organizationId, productIds) {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return [];
      }
      const allowed = new Set(productIds.map(String));
      return [...prices.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            allowed.has(String(item.productId)) &&
            String(item.status) === 'active',
        )
        .map((item) => ({ ...item }));
    },

    async findProductsByIds(organizationId, productIds) {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return [];
      }
      const allowed = new Set(productIds.map(String));
      return [...products.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            allowed.has(String(item._id)),
        )
        .map((item) => ({ ...item }));
    },

    async insertPrice(_session, doc) {
      assertUniquePrice(doc.organizationId, doc.productId, doc.priceTier);
      const id = `price-${seq++}`;
      const record = { _id: id, ...doc };
      prices.set(id, record);
      return { ...record };
    },

    async updatePrice(_session, organizationId, id, patch) {
      const existing = prices.get(id);
      if (existing === undefined || String(existing.organizationId) !== String(organizationId)) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniquePrice(organizationId, next.productId, next.priceTier, id);
      prices.set(id, next);
      return { ...next };
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    exportRehearsalSnapshot() {
      return {
        seq,
        categories: [...categories.entries()].map(([id, record]) => [id, { ...record }]),
        products: [...products.entries()].map(([id, record]) => [id, { ...record }]),
        packagingUnits: [...packagingUnits.entries()].map(([id, record]) => [id, { ...record }]),
        prices: [...prices.entries()].map(([id, record]) => [id, { ...record }]),
        audits: audits.map((event) => ({ ...event })),
      };
    },

    restoreRehearsalSnapshot(snapshot) {
      categories.clear();
      products.clear();
      packagingUnits.clear();
      prices.clear();
      audits.length = 0;
      seq = snapshot.seq;
      for (const [id, record] of snapshot.categories) {
        categories.set(id, { ...record });
      }
      for (const [id, record] of snapshot.products) {
        products.set(id, { ...record });
      }
      for (const [id, record] of snapshot.packagingUnits) {
        packagingUnits.set(id, { ...record });
      }
      for (const [id, record] of snapshot.prices) {
        prices.set(id, { ...record });
      }
      for (const event of snapshot.audits) {
        audits.push({ ...event });
      }
    },
  };
}

module.exports = {
  createMongooseCatalogStore,
  createInMemoryCatalogStore,
};
