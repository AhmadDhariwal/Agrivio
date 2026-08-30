const mongoose = require('mongoose');
const { CustomerModel } = require('./persistence/customer.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseCustomersStore() {
  return {
    async listCustomers(organizationId, filter = {}, pagination = {}) {
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
      let find = CustomerModel.find(query).sort({ createdAt: -1, _id: -1 });
      if (hasPagination) {
        find = find.skip(skip).limit(pageSize);
      }
      const [total, items] = await Promise.all([
        CustomerModel.countDocuments(query).exec(),
        find.lean().exec(),
      ]);
      return { items, total };
    },

    async countCustomers(organizationId) {
      return CustomerModel.countDocuments({ organizationId }).exec();
    },

    async countCustomersWithOpening(organizationId) {
      return CustomerModel.countDocuments({
        organizationId,
        'openingBalance.status': 'posted',
      }).exec();
    },

    async findCustomerById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return CustomerModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertCustomer(session, doc) {
      try {
        const [created] = await CustomerModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateCustomer(session, organizationId, id, patch) {
      try {
        return await CustomerModel.findOneAndUpdate(
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

    async deleteCustomer(session, organizationId, id) {
      const result = await CustomerModel.deleteOne({ _id: id, organizationId }, withSession(session));
      return result.deletedCount === 1;
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryCustomersStore() {
  const customers = new Map();
  const audits = [];
  let seq = 1;

  return {
    async listCustomers(organizationId, filter = {}, pagination = {}) {
      let all = [...customers.values()].filter(
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
      const hasPagination = pagination.skip !== undefined || pagination.pageSize !== undefined;
      const { skip = 0, pageSize = 25 } = pagination;
      const selected = hasPagination ? all.slice(skip, skip + pageSize) : all;
      const items = selected.map((item) => ({ ...item }));
      return { items, total };
    },

    async countCustomers(organizationId) {
      return [...customers.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async countCustomersWithOpening(organizationId) {
      return [...customers.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          item.openingBalance &&
          item.openingBalance.status === 'posted',
      ).length;
    },

    async findCustomerById(organizationId, id) {
      const record = customers.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertCustomer(_session, doc) {
      const id = `customer-${seq++}`;
      const record = { _id: id, ...doc };
      customers.set(id, record);
      return { ...record };
    },

    async updateCustomer(_session, organizationId, id, patch) {
      const existing = await this.findCustomerById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      customers.set(id, next);
      return { ...next };
    },

    async deleteCustomer(_session, organizationId, id) {
      const existing = await this.findCustomerById(organizationId, id);
      if (existing === null) {
        return false;
      }
      customers.delete(id);
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
  createMongooseCustomersStore,
  createInMemoryCustomersStore,
};
