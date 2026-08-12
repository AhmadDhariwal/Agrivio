const mongoose = require('mongoose');
const { SaleModel } = require('./persistence/sale.model');
const { InvoiceSequenceModel } = require('./persistence/invoice-sequence.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseSalesStore() {
  return {
    async listSales(organizationId, filter = {}) {
      const query = { organizationId };
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.customerId) {
        query.customerId = filter.customerId;
      }
      if (filter.warehouseId) {
        query.warehouseId = filter.warehouseId;
      }
      if (filter.branchId) {
        query.branchId = filter.branchId;
      }
      return SaleModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async findSaleById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return SaleModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertSale(session, doc) {
      try {
        const [created] = await SaleModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateSale(session, organizationId, id, patch) {
      return SaleModel.findOneAndUpdate(
        { _id: id, organizationId },
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async updateSaleIfDraft(session, organizationId, id, expectedVersion, patch) {
      return SaleModel.findOneAndUpdate(
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

    async deleteSale(session, organizationId, id) {
      const result = await SaleModel.deleteOne(
        { _id: id, organizationId, status: 'draft' },
        withSession(session),
      );
      return result.deletedCount === 1;
    },

    async countSales(organizationId, filter = {}) {
      const query = { organizationId, ...filter };
      return SaleModel.countDocuments(query).exec();
    },

    async incrementInvoiceSequence(session, organizationId, branchId) {
      const updated = await InvoiceSequenceModel.findOneAndUpdate(
        { organizationId, branchId },
        { $inc: { nextSequenceNumber: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, ...withSession(session) },
      )
        .lean()
        .exec();
      return Number(updated.nextSequenceNumber);
    },

    async getInvoiceSequence(organizationId, branchId) {
      return InvoiceSequenceModel.findOne({ organizationId, branchId }).lean().exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemorySalesStore() {
  const sales = new Map();
  const sequences = new Map();
  const audits = [];
  let seq = 1;

  function sequenceKey(organizationId, branchId) {
    return `${organizationId}:${branchId}`;
  }

  return {
    async listSales(organizationId, filter = {}) {
      return [...sales.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (filter.status && item.status !== filter.status) {
            return false;
          }
          if (filter.customerId && String(item.customerId) !== String(filter.customerId)) {
            return false;
          }
          if (filter.warehouseId && String(item.warehouseId) !== String(filter.warehouseId)) {
            return false;
          }
          if (filter.branchId && String(item.branchId) !== String(filter.branchId)) {
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async findSaleById(organizationId, id) {
      const record = sales.get(id);
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return {
        ...record,
        lines: record.lines.map((line) => ({ ...line })),
      };
    },

    async insertSale(_session, doc) {
      const id = `sale-${seq++}`;
      const now = new Date();
      const record = {
        _id: id,
        createdAt: now,
        updatedAt: now,
        ...doc,
        lines: doc.lines.map((line) => ({ ...line })),
      };
      sales.set(id, record);
      return {
        ...record,
        lines: record.lines.map((line) => ({ ...line })),
      };
    },

    async updateSale(_session, organizationId, id, patch) {
      const current = await this.findSaleById(organizationId, id);
      if (current === null) {
        return null;
      }
      const next = {
        ...current,
        ...patch,
        lines: (patch.lines ?? current.lines).map((line) => ({ ...line })),
        updatedAt: new Date(),
      };
      sales.set(id, next);
      return {
        ...next,
        lines: next.lines.map((line) => ({ ...line })),
      };
    },

    async updateSaleIfDraft(_session, organizationId, id, expectedVersion, patch) {
      const current = sales.get(id);
      if (
        !current ||
        String(current.organizationId) !== String(organizationId) ||
        current.status !== 'draft' ||
        Number(current.version) !== expectedVersion
      ) {
        return null;
      }
      const next = {
        ...current,
        ...patch,
        lines: (patch.lines ?? current.lines).map((line) => ({ ...line })),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      };
      sales.set(id, next);
      return {
        ...next,
        lines: next.lines.map((line) => ({ ...line })),
      };
    },

    async deleteSale(_session, organizationId, id) {
      const current = sales.get(id);
      if (!current || String(current.organizationId) !== String(organizationId)) {
        return false;
      }
      if (current.status !== 'draft') {
        return false;
      }
      sales.delete(id);
      return true;
    },

    async countSales(organizationId, filter = {}) {
      return [...sales.values()].filter((item) => {
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

    async incrementInvoiceSequence(_session, organizationId, branchId) {
      const key = sequenceKey(organizationId, branchId);
      const current = sequences.get(key) ?? { nextSequenceNumber: 0 };
      const nextSequenceNumber = Number(current.nextSequenceNumber) + 1;
      sequences.set(key, { organizationId, branchId, nextSequenceNumber });
      return nextSequenceNumber;
    },

    async getInvoiceSequence(organizationId, branchId) {
      const key = sequenceKey(organizationId, branchId);
      return sequences.get(key) ?? null;
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listSalesForTest() {
      return [...sales.values()].map((item) => ({
        ...item,
        lines: item.lines.map((line) => ({ ...line })),
      }));
    },

    listSequencesForTest() {
      return [...sequences.values()];
    },
  };
}

module.exports = {
  createMongooseSalesStore,
  createInMemorySalesStore,
};
