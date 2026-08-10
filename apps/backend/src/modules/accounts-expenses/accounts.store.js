const mongoose = require('mongoose');
const { AccountModel } = require('./persistence/account.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongooseAccountsStore() {
  return {
    async listAccounts(organizationId) {
      return AccountModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async findAccountById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return AccountModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async insertAccount(session, doc) {
      try {
        const [created] = await AccountModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async updateAccount(session, organizationId, id, patch) {
      try {
        return await AccountModel.findOneAndUpdate(
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

function createInMemoryAccountsStore() {
  const accounts = new Map();
  const audits = [];
  let seq = 1;

  function assertUnique(organizationId, nameNormalized, excludeId) {
    for (const record of accounts.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate account');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  return {
    async listAccounts(organizationId) {
      return [...accounts.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async findAccountById(organizationId, id) {
      const record = accounts.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertAccount(_session, doc) {
      assertUnique(doc.organizationId, doc.nameNormalized);
      const id = `account-${seq++}`;
      const record = { _id: id, ...doc };
      accounts.set(id, record);
      return { ...record };
    },

    async updateAccount(_session, organizationId, id, patch) {
      const existing = await this.findAccountById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUnique(organizationId, next.nameNormalized, id);
      accounts.set(id, next);
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
  createMongooseAccountsStore,
  createInMemoryAccountsStore,
};
