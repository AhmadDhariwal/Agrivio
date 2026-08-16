const mongoose = require('mongoose');
const { AccountModel } = require('./persistence/account.model');
const { AccountMovementModel } = require('./persistence/account-movement.model');
const { ExpenseCategoryModel } = require('./persistence/expense-category.model');
const { ExpenseModel } = require('./persistence/expense.model');
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

function sumMinorUnits(records) {
  let total = 0n;
  for (const record of records) {
    total += BigInt(String(record.signedAmountMinorUnits ?? '0'));
  }
  return total.toString();
}

function applySession(query, session) {
  if (session) {
    query.session(session);
  }
  return query;
}

function createMongooseAccountsStore() {
  return {
    allocateId() {
      return new mongoose.Types.ObjectId();
    },

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

    async findAccountById(organizationId, id, session) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return applySession(
        AccountModel.findOne({ _id: id, organizationId }),
        session,
      )
        .lean()
        .exec();
    },

    async insertAccount(session, doc) {
      try {
        const [created] = await AccountModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
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
        throw markDuplicate(error);
      }
    },

    async insertAccountMovement(session, doc) {
      try {
        const [created] = await AccountMovementModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async findMovementById(organizationId, id, session) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return applySession(
        AccountMovementModel.findOne({ _id: id, organizationId, status: 'posted' }),
        session,
      )
        .lean()
        .exec();
    },

    async findMovementByReversalOfId(organizationId, reversalOfId, session) {
      if (!mongoose.isValidObjectId(reversalOfId)) {
        return null;
      }
      return applySession(
        AccountMovementModel.findOne({
          organizationId,
          reversalOfId,
          status: 'posted',
        }),
        session,
      )
        .lean()
        .exec();
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
      return applySession(
        AccountMovementModel.find({
          organizationId,
          sourceType,
          sourceId,
          status: 'posted',
        }).sort({ postedAt: -1 }),
        session,
      )
        .lean()
        .exec();
    },

    async listMovementsBySourceId(organizationId, sourceId, session) {
      if (!mongoose.isValidObjectId(sourceId)) {
        return [];
      }
      return applySession(
        AccountMovementModel.find({
          organizationId,
          sourceId,
          status: 'posted',
        }).sort({ postedAt: 1 }),
        session,
      )
        .lean()
        .exec();
    },

    async sumPostedMovements(organizationId, accountId, session) {
      if (!mongoose.isValidObjectId(accountId)) {
        return '0';
      }
      const records = await applySession(
        AccountMovementModel.find({
          organizationId,
          accountId,
          status: 'posted',
        }).select('signedAmountMinorUnits'),
        session,
      )
        .lean()
        .exec();
      return sumMinorUnits(records);
    },

    async listExpenseCategories(organizationId) {
      return ExpenseCategoryModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async findExpenseCategoryById(organizationId, id, session) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return applySession(
        ExpenseCategoryModel.findOne({ _id: id, organizationId }),
        session,
      )
        .lean()
        .exec();
    },

    async insertExpenseCategory(session, doc) {
      try {
        const [created] = await ExpenseCategoryModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateExpenseCategory(session, organizationId, id, patch) {
      try {
        return await ExpenseCategoryModel.findOneAndUpdate(
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

    async listExpenses(organizationId) {
      return ExpenseModel.find({ organizationId }).sort({ createdAt: -1 }).lean().exec();
    },

    async findExpenseById(organizationId, id, session) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return applySession(ExpenseModel.findOne({ _id: id, organizationId }), session)
        .lean()
        .exec();
    },

    async findExpenseByCorrectionOfId(organizationId, correctionOfId, session) {
      if (!mongoose.isValidObjectId(correctionOfId)) {
        return null;
      }
      return applySession(
        ExpenseModel.findOne({ organizationId, correctionOfId }),
        session,
      )
        .lean()
        .exec();
    },

    async insertExpense(session, doc) {
      try {
        const [created] = await ExpenseModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async updateExpense(session, organizationId, id, patch) {
      try {
        return await ExpenseModel.findOneAndUpdate(
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

    async updateExpenseConditional(session, organizationId, id, expectedVersion, patch) {
      try {
        return await ExpenseModel.findOneAndUpdate(
          { _id: id, organizationId, version: expectedVersion },
          { $set: patch },
          { new: true, ...withSession(session) },
        )
          .lean()
          .exec();
      } catch (error) {
        throw markDuplicate(error);
      }
    },

    async deleteExpenseDraft(session, organizationId, id) {
      const result = await ExpenseModel.deleteOne(
        { _id: id, organizationId, status: 'draft' },
        withSession(session),
      );
      return result.deletedCount === 1;
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryAccountsStore() {
  const accounts = new Map();
  const movements = new Map();
  const categories = new Map();
  const expenses = new Map();
  const audits = [];
  let seq = 1;
  let movementSeq = 1;
  let categorySeq = 1;
  let expenseSeq = 1;
  let sourceSeq = 1;

  function assertUniqueAccount(organizationId, nameNormalized, excludeId) {
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

  function assertUniqueCategory(organizationId, nameNormalized, excludeId) {
    for (const record of categories.values()) {
      if (String(record.organizationId) !== String(organizationId)) {
        continue;
      }
      if (excludeId !== undefined && String(record._id) === String(excludeId)) {
        continue;
      }
      if (record.nameNormalized === nameNormalized) {
        const error = new Error('Duplicate expense category');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniqueMovement(doc, excludeId) {
    for (const existing of movements.values()) {
      if (excludeId !== undefined && String(existing._id) === String(excludeId)) {
        continue;
      }
      if (
        String(existing.organizationId) === String(doc.organizationId) &&
        existing.sourceType === doc.sourceType &&
        String(existing.sourceId) === String(doc.sourceId) &&
        existing.status === 'posted' &&
        doc.status === 'posted'
      ) {
        const error = new Error('Duplicate account movement');
        error.agrivioDuplicate = true;
        throw error;
      }
      if (
        doc.reversalOfId &&
        existing.reversalOfId &&
        String(existing.organizationId) === String(doc.organizationId) &&
        String(existing.reversalOfId) === String(doc.reversalOfId) &&
        existing.status === 'posted'
      ) {
        const error = new Error('Duplicate reversal account movement');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  function assertUniqueExpenseCorrection(doc, excludeId) {
    if (!doc.correctionOfId) {
      return;
    }
    for (const existing of expenses.values()) {
      if (excludeId !== undefined && String(existing._id) === String(excludeId)) {
        continue;
      }
      if (
        String(existing.organizationId) === String(doc.organizationId) &&
        existing.correctionOfId &&
        String(existing.correctionOfId) === String(doc.correctionOfId)
      ) {
        const error = new Error('Duplicate expense correction');
        error.agrivioDuplicate = true;
        throw error;
      }
    }
  }

  return {
    allocateId() {
      return `src-${sourceSeq++}`;
    },

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
      assertUniqueAccount(doc.organizationId, doc.nameNormalized);
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
      assertUniqueAccount(organizationId, next.nameNormalized, id);
      accounts.set(id, next);
      return { ...next };
    },

    async insertAccountMovement(_session, doc) {
      assertUniqueMovement(doc);
      const id = doc._id ? String(doc._id) : `account-movement-${movementSeq++}`;
      const record = { ...doc, _id: id, sourceId: doc.sourceId ?? id };
      movements.set(id, record);
      return { ...record };
    },

    async findMovementById(organizationId, id) {
      const record = movements.get(id);
      if (
        record === undefined ||
        String(record.organizationId) !== String(organizationId) ||
        record.status !== 'posted'
      ) {
        return null;
      }
      return { ...record };
    },

    async findMovementByReversalOfId(organizationId, reversalOfId) {
      for (const record of movements.values()) {
        if (
          String(record.organizationId) === String(organizationId) &&
          record.reversalOfId &&
          String(record.reversalOfId) === String(reversalOfId) &&
          record.status === 'posted'
        ) {
          return { ...record };
        }
      }
      return null;
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

    async listMovementsBySourceId(organizationId, sourceId) {
      return [...movements.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.sourceId) === String(sourceId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
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

    async listExpenseCategories(organizationId) {
      return [...categories.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }));
    },

    async findExpenseCategoryById(organizationId, id) {
      const record = categories.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async insertExpenseCategory(_session, doc) {
      assertUniqueCategory(doc.organizationId, doc.nameNormalized);
      const id = `expense-category-${categorySeq++}`;
      const record = { _id: id, ...doc };
      categories.set(id, record);
      return { ...record };
    },

    async updateExpenseCategory(_session, organizationId, id, patch) {
      const existing = await this.findExpenseCategoryById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueCategory(organizationId, next.nameNormalized, id);
      categories.set(id, next);
      return { ...next };
    },

    async listExpenses(organizationId) {
      return [...expenses.values()]
        .filter((item) => String(item.organizationId) === String(organizationId))
        .map((item) => ({ ...item }))
        .sort((a, b) => String(b._id).localeCompare(String(a._id)));
    },

    async findExpenseById(organizationId, id) {
      const record = expenses.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async findExpenseByCorrectionOfId(organizationId, correctionOfId) {
      for (const record of expenses.values()) {
        if (
          String(record.organizationId) === String(organizationId) &&
          record.correctionOfId &&
          String(record.correctionOfId) === String(correctionOfId)
        ) {
          return { ...record };
        }
      }
      return null;
    },

    async insertExpense(_session, doc) {
      assertUniqueExpenseCorrection(doc);
      const id = doc._id ? String(doc._id) : `expense-${expenseSeq++}`;
      const record = { _id: id, ...doc };
      expenses.set(id, record);
      return { ...record };
    },

    async updateExpense(_session, organizationId, id, patch) {
      const existing = await this.findExpenseById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueExpenseCorrection(next, id);
      expenses.set(id, next);
      return { ...next };
    },

    async updateExpenseConditional(_session, organizationId, id, expectedVersion, patch) {
      const existing = await this.findExpenseById(organizationId, id);
      if (existing === null || Number(existing.version) !== Number(expectedVersion)) {
        return null;
      }
      const next = { ...existing, ...patch };
      assertUniqueExpenseCorrection(next, id);
      expenses.set(id, next);
      return { ...next };
    },

    async deleteExpenseDraft(_session, organizationId, id) {
      const existing = expenses.get(id);
      if (
        existing === undefined ||
        String(existing.organizationId) !== String(organizationId) ||
        existing.status !== 'draft'
      ) {
        return false;
      }
      expenses.delete(id);
      return true;
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

    listExpensesForTest() {
      return [...expenses.values()].map((item) => ({ ...item }));
    },
  };
}

module.exports = {
  createMongooseAccountsStore,
  createInMemoryAccountsStore,
};
