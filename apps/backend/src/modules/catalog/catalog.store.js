const mongoose = require('mongoose');
const { ProductCategoryModel } = require('./persistence/product-category.model');
const { ProductModel } = require('./persistence/product.model');
const { ProductPackagingUnitModel } = require('./persistence/product-packaging-unit.model');
const { ProductPriceModel } = require('./persistence/product-price.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
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
    async listCategories(organizationId) {
      return ProductCategoryModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
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

    async listProducts(organizationId) {
      return ProductModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async countProducts(organizationId) {
      return ProductModel.countDocuments({ organizationId }).exec();
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
    async listCategories(organizationId) {
      return [...categories.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
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

    async listProducts(organizationId) {
      return [...products.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async countProducts(organizationId) {
      return [...products.values()].filter(
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
  };
}

module.exports = {
  createMongooseCatalogStore,
  createInMemoryCatalogStore,
};
