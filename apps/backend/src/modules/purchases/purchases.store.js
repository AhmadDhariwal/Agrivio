const mongoose = require('mongoose');
const { PurchaseModel } = require('./persistence/purchase.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongoosePurchasesStore() {
  return {
    async listPurchases(organizationId, filter = {}) {
      const query = { organizationId };
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.supplierId) {
        query.supplierId = filter.supplierId;
      }
      if (filter.warehouseId) {
        query.warehouseId = filter.warehouseId;
      }
      return PurchaseModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async findPurchaseById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return PurchaseModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertPurchase(session, doc) {
      try {
        const [created] = await PurchaseModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updatePurchase(session, organizationId, id, patch) {
      return PurchaseModel.findOneAndUpdate(
        { _id: id, organizationId },
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async deletePurchase(session, organizationId, id) {
      const result = await PurchaseModel.deleteOne(
        { _id: id, organizationId, status: 'draft' },
        withSession(session),
      );
      return result.deletedCount === 1;
    },

    async countPurchases(organizationId, filter = {}) {
      const query = { organizationId, ...filter };
      return PurchaseModel.countDocuments(query).exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryPurchasesStore() {
  const purchases = new Map();
  const audits = [];
  let seq = 1;

  return {
    async listPurchases(organizationId, filter = {}) {
      return [...purchases.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filter.status && item.status !== filter.status) {
            return false;
          }
          if (filter.supplierId && String(item.supplierId) !== String(filter.supplierId)) {
            return false;
          }
          if (filter.warehouseId && String(item.warehouseId) !== String(filter.warehouseId)) {
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async findPurchaseById(organizationId, id) {
      const record = purchases.get(id);
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return {
        ...record,
        lines: record.lines.map((line) => ({ ...line })),
        landedCosts: { ...record.landedCosts },
      };
    },

    async insertPurchase(_session, doc) {
      const id = `purchase-${seq++}`;
      const now = new Date();
      const record = {
        _id: id,
        createdAt: now,
        updatedAt: now,
        ...doc,
        lines: doc.lines.map((line) => ({ ...line })),
        landedCosts: { ...doc.landedCosts },
      };
      purchases.set(id, record);
      return {
        ...record,
        lines: record.lines.map((line) => ({ ...line })),
        landedCosts: { ...record.landedCosts },
      };
    },

    async updatePurchase(_session, organizationId, id, patch) {
      const current = await this.findPurchaseById(organizationId, id);
      if (current === null) {
        return null;
      }
      const next = {
        ...current,
        ...patch,
        lines: (patch.lines ?? current.lines).map((line) => ({ ...line })),
        landedCosts: { ...(patch.landedCosts ?? current.landedCosts) },
        updatedAt: new Date(),
      };
      purchases.set(id, next);
      return {
        ...next,
        lines: next.lines.map((line) => ({ ...line })),
        landedCosts: { ...next.landedCosts },
      };
    },

    async deletePurchase(_session, organizationId, id) {
      const current = purchases.get(id);
      if (!current || String(current.organizationId) !== String(organizationId)) {
        return false;
      }
      if (current.status !== 'draft') {
        return false;
      }
      purchases.delete(id);
      return true;
    },

    async countPurchases(organizationId, filter = {}) {
      return [...purchases.values()].filter((item) => {
        if (String(item.organizationId) !== String(organizationId)) {
          return false;
        }
        for (const [key, value] of Object.entries(filter)) {
          if (String(item[key]) !== String(value)) {
            return false;
          }
        }
        return true;
      }).length;
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listPurchasesForTest() {
      return [...purchases.values()].map((item) => ({
        ...item,
        lines: item.lines.map((line) => ({ ...line })),
      }));
    },
  };
}

module.exports = {
  createMongoosePurchasesStore,
  createInMemoryPurchasesStore,
};
