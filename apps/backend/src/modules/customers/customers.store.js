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
    async listCustomers(organizationId) {
      return CustomerModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async countCustomers(organizationId) {
      return CustomerModel.countDocuments({ organizationId }).exec();
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
    async listCustomers(organizationId) {
      return [...customers.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async countCustomers(organizationId) {
      return [...customers.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
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
