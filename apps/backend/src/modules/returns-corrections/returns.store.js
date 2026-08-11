const mongoose = require('mongoose');
const { ReturnModel } = require('./persistence/return.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseReturnsStore() {
  return {
    async listReturns(organizationId, filter = {}) {
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
      if (filter.purchaseId) {
        query.purchaseId = filter.purchaseId;
      }
      return ReturnModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async findReturnById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return ReturnModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertReturn(session, doc) {
      try {
        const [created] = await ReturnModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateReturn(session, organizationId, id, patch) {
      return ReturnModel.findOneAndUpdate(
        { _id: id, organizationId },
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async updateReturnIfDraft(session, organizationId, id, expectedVersion, patch) {
      return ReturnModel.findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: 'draft',
          version: expectedVersion,
        },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async updateReturnIfPosted(session, organizationId, id, patch) {
      return ReturnModel.findOneAndUpdate(
        { _id: id, organizationId, status: 'draft' },
        { $set: { ...patch, status: 'posted' } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async listPostedReturnsByPurchase(organizationId, purchaseId) {
      return ReturnModel.find({
        organizationId,
        purchaseId,
        status: 'posted',
      })
        .lean()
        .exec();
    },

    async sumPostedReturnedQuantityByPurchaseLine(organizationId, purchaseId, originalLineIndex) {
      const returns = await ReturnModel.find({
        organizationId,
        purchaseId,
        status: 'posted',
      })
        .lean()
        .exec();

      let total = 0n;
      for (const ret of returns) {
        for (const line of ret.lines ?? []) {
          if (Number(line.originalLineIndex) === Number(originalLineIndex)) {
            total += BigInt(String(line.quantityBaseMinorUnits ?? '0'));
          }
        }
      }
      return total.toString();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryReturnsStore() {
  const returns = new Map();
  const audits = [];
  let seq = 1;

  return {
    async listReturns(organizationId, filter = {}) {
      return [...returns.values()]
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
          if (filter.purchaseId && String(item.purchaseId) !== String(filter.purchaseId)) {
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async findReturnById(organizationId, id) {
      const record = returns.get(id);
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record, lines: record.lines.map((line) => ({ ...line })) };
    },

    async insertReturn(_session, doc) {
      const id = `return-${seq++}`;
      const now = new Date();
      const record = {
        _id: id,
        createdAt: now,
        updatedAt: now,
        ...doc,
        lines: doc.lines.map((line) => ({ ...line })),
      };
      returns.set(id, record);
      return { ...record, lines: record.lines.map((line) => ({ ...line })) };
    },

    async updateReturn(_session, organizationId, id, patch) {
      const current = await this.findReturnById(organizationId, id);
      if (current === null) {
        return null;
      }
      const next = {
        ...current,
        ...patch,
        lines: (patch.lines ?? current.lines).map((line) => ({ ...line })),
        updatedAt: new Date(),
      };
      returns.set(id, next);
      return { ...next, lines: next.lines.map((line) => ({ ...line })) };
    },

    async updateReturnIfDraft(_session, organizationId, id, expectedVersion, patch) {
      const current = await this.findReturnById(organizationId, id);
      if (current === null) {
        return null;
      }
      if (current.status !== 'draft' || Number(current.version) !== Number(expectedVersion)) {
        return null;
      }
      return this.updateReturn(_session, organizationId, id, {
        ...patch,
        version: expectedVersion + 1,
      });
    },

    async updateReturnIfPosted(_session, organizationId, id, patch) {
      const current = await this.findReturnById(organizationId, id);
      if (current === null) {
        return null;
      }
      if (current.status !== 'draft') {
        return null;
      }
      return this.updateReturn(_session, organizationId, id, {
        ...patch,
        status: 'posted',
      });
    },

    async listPostedReturnsByPurchase(organizationId, purchaseId) {
      return [...returns.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          String(item.purchaseId) === String(purchaseId) &&
          item.status === 'posted',
      ).map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }));
    },

    async sumPostedReturnedQuantityByPurchaseLine(organizationId, purchaseId, originalLineIndex) {
      const posted = await this.listPostedReturnsByPurchase(organizationId, purchaseId);
      let total = 0n;
      for (const ret of posted) {
        for (const line of ret.lines ?? []) {
          if (Number(line.originalLineIndex) === Number(originalLineIndex)) {
            total += BigInt(String(line.quantityBaseMinorUnits ?? '0'));
          }
        }
      }
      return total.toString();
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listReturnsForTest() {
      return [...returns.values()].map((item) => ({
        ...item,
        lines: item.lines.map((line) => ({ ...line })),
      }));
    },
  };
}

module.exports = {
  createMongooseReturnsStore,
  createInMemoryReturnsStore,
};
