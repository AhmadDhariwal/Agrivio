const mongoose = require('mongoose');
const { AccountModel } = require('./persistence/account.model');
const { AccountMovementModel } = require('./persistence/account-movement.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function sumMinorUnits(records) {
  let total = 0n;
  for (const record of records) {
    total += BigInt(String(record.signedAmountMinorUnits ?? '0'));
  }
  return total.toString();
}

function createMongooseAccountsStore() {
  return {
    async listAccounts(organizationId) {
      return AccountModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async countAccounts(organizationId) {
      return AccountModel.countDocuments({ organizationId }).exec();
    },

    async countAccountsWithOpening(organizationId) {
      return AccountModel.countDocuments({
        organizationId,
        'openingBalance.status': 'posted',
      }).exec();
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

    async insertAccountMovement(session, doc) {
      try {
        const [created] = await AccountMovementModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async listMovementsByAccount(organizationId, accountId) {
      if (!mongoose.isValidObjectId(accountId)) {
        return [];
      }
      return AccountMovementModel.find({
        organizationId,
        accountId,
        status: 'posted',
      })
        .sort({ postedAt: -1 })
        .lean()
        .exec();
    },

    async listMovementsBySource(organizationId, sourceType, sourceId, session) {
      if (sourceId && !mongoose.isValidObjectId(sourceId)) {
        return [];
      }
      const query = AccountMovementModel.find({
        organizationId,
        sourceType,
        sourceId,
        status: 'posted',
      }).sort({ postedAt: -1 });
      if (session) {
        query.session(session);
      }
      return query.lean().exec();
    },

    async sumPostedMovements(organizationId, accountId) {
      if (!mongoose.isValidObjectId(accountId)) {
        return '0';
      }
      const records = await AccountMovementModel.find({
        organizationId,
        accountId,
        status: 'posted',
      })
        .select('signedAmountMinorUnits')
        .lean()
        .exec();
      return sumMinorUnits(records);
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryAccountsStore() {
  const accounts = new Map();
  const movements = new Map();
  const audits = [];
  let seq = 1;
  let movementSeq = 1;

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

    async countAccounts(organizationId) {
      return [...accounts.values()].filter(
        (item) => String(item.organizationId) === String(organizationId),
      ).length;
    },

    async countAccountsWithOpening(organizationId) {
      return [...accounts.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          item.openingBalance &&
          item.openingBalance.status === 'posted',
      ).length;
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

    async insertAccountMovement(_session, doc) {
      for (const existing of movements.values()) {
        if (
          String(existing.organizationId) === String(doc.organizationId) &&
          existing.sourceType === doc.sourceType &&
          String(existing.sourceId) === String(doc.sourceId) &&
          existing.status === 'posted'
        ) {
          const error = new Error('Duplicate opening account movement');
          error.agrivioDuplicate = true;
          throw error;
        }
      }
      const id = `account-movement-${movementSeq++}`;
      const record = { _id: id, ...doc };
      movements.set(id, record);
      return { ...record };
    },

    async listMovementsByAccount(organizationId, accountId) {
      return [...movements.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.accountId) === String(accountId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async listMovementsBySource(organizationId, sourceType, sourceId) {
      return [...movements.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.sourceType) === String(sourceType) &&
            String(item.sourceId) === String(sourceId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async sumPostedMovements(organizationId, accountId) {
      const records = [...movements.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          String(item.accountId) === String(accountId) &&
          item.status === 'posted',
      );
      return sumMinorUnits(records);
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listMovementsForTest() {
      return [...movements.values()].map((item) => ({ ...item }));
    },
  };
}

module.exports = {
  createMongooseAccountsStore,
  createInMemoryAccountsStore,
};
