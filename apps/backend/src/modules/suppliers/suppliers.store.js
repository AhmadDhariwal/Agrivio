const mongoose = require('mongoose');
const { SupplierModel } = require('./persistence/supplier.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseSuppliersStore() {
  return {
    async listSuppliers(organizationId, filter = {}, pagination = {}) {
      const query = { organizationId };
      if (filter.status === 'active' || filter.status === 'inactive') {
        query.status = filter.status;
      }
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search !== '') {
        query.nameNormalized = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      }
      const hasPagination = pagination.skip !== undefined || pagination.pageSize !== undefined;
      const { skip = 0, pageSize = 25 } = pagination;
      let find = SupplierModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (hasPagination) {
        find = find.skip(skip).limit(pageSize);
      }
      const [total, items] = await Promise.all([
        SupplierModel.countDocuments(query).exec(),
        find.lean().exec(),
      ]);
      return { items, total };
    },

    async countSuppliers(organizationId) {
      return SupplierModel.countDocuments({ organizationId }).exec();
    },

    async countSuppliersWithOpening(organizationId) {
      return SupplierModel.countDocuments({
        organizationId,
        'openingBalance.status': 'posted',
      }).exec();
    },

    async findSupplierById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return SupplierModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertSupplier(session, doc) {
      try {
        const [created] = await SupplierModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateSupplier(session, organizationId, id, patch) {
      try {
        return await SupplierModel.findOneAndUpdate(
          { _id: id, organizationId },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async deleteSupplier(session, organizationId, id) {
      const result = await SupplierModel.deleteOne({ _id: id, organizationId }, withSession(session));
      return result.deletedCount === 1;
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemorySuppliersStore() {
  const suppliers = new Map();
  const audits = [];
  let seq = 1;

  function assertUnique(organizationId, nameNormalized, excludeId) {
    for (const record of suppliers.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate supplier');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  return {
    async listSuppliers(organizationId, filter = {}, pagination = {}) {
      let all = [...suppliers.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      );
      if (filter.status === 'active' || filter.status === 'inactive') {
        all = all.filter((item) => String(item.status) === filter.status);
      }
      const search = String(filter.search ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (search !== '') {
        all = all.filter((item) => String(item.nameNormalized).includes(search));
      }
      const total = all.length;
      const hasPagination = pagination.skip !== undefined || pagination.pageSize !== undefined;
      const { skip = 0, pageSize = 25 } = pagination;
      const selected = hasPagination ? all.slice(skip, skip + pageSize) : all;
      return { items: selected.map((item) => ({ ...item })), total };
    },

    async countSuppliers(organizationId) {
      return [...suppliers.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async countSuppliersWithOpening(organizationId) {
      return [...suppliers.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          item.openingBalance &&
          item.openingBalance.status === 'posted',
      ).length;
    },

    async findSupplierById(organizationId, id) {
      const record = suppliers.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertSupplier(_session, doc) {
      assertUnique(doc.organizationId, doc.nameNormalized);
      const id = `supplier-${seq++}`;
      const record = { _id: id, ...doc };
      suppliers.set(id, record);
      return { ...record };
    },

    async updateSupplier(_session, organizationId, id, patch) {
      const existing = await this.findSupplierById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUnique(organizationId, next.nameNormalized, id);
      suppliers.set(id, next);
      return { ...next };
    },

    async deleteSupplier(_session, organizationId, id) {
      const existing = await this.findSupplierById(organizationId, id);
      if (existing === null) {
        return false;
      }
      suppliers.delete(id);
      return true;
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
  createMongooseSuppliersStore,
  createInMemorySuppliersStore,
};
