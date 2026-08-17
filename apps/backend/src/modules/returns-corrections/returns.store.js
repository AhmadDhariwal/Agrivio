const mongoose = require('mongoose');
const { ReturnModel } = require('./persistence/return.model');
const { CorrectiveTransactionModel } = require('./persistence/corrective-transaction.model');
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
      if (filter.saleId) {
        query.saleId = filter.saleId;
      }
      if (filter.customerId) {
        query.customerId = filter.customerId;
      }
      if (filter.returnType) {
        query.returnType = filter.returnType;
      }
      return ReturnModel.find(query).sort({ createdAt: -1 }).lean().exec();
    },

    async findReturnById(organizationId, id, session) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      const query = ReturnModel.findOne({ _id: id, organizationId });
      if (session) {
        query.session(session);
      }
      return query.lean().exec();
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

    async deleteReturnIfDraft(session, organizationId, id) {
      const result = await ReturnModel.deleteOne(
        { _id: id, organizationId, status: 'draft' },
        withSession(session),
      );
      return result.deletedCount === 1;
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

    async updateReturnIfPostedUnreversed(session, organizationId, id, expectedVersion, patch) {
      return ReturnModel.findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: 'posted',
          reversedByCorrectiveTransactionId: null,
          version: expectedVersion,
        },
        { $set: { ...patch, version: expectedVersion + 1 } },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async insertCorrectiveTransaction(session, doc) {
      try {
        const [created] = await CorrectiveTransactionModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async findCorrectiveTransactionBySource(organizationId, sourceType, sourceId, session) {
      if (sourceId && !mongoose.isValidObjectId(sourceId)) {
        return null;
      }
      const query = CorrectiveTransactionModel.findOne({
        organizationId,
        sourceType,
        sourceId,
      });
      if (session) {
        query.session(session);
      }
      return query.lean().exec();
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

    async listPostedReturnsBySale(organizationId, saleId, session) {
      const query = ReturnModel.find({
        organizationId,
        saleId,
        status: 'posted',
      });
      if (session) {
        query.session(session);
      }
      return query.lean().exec();
    },

    async sumPostedReturnedQuantityBySaleLine(
      organizationId,
      saleId,
      originalLineIndex,
      batchId,
      session,
    ) {
      const posted = await this.listPostedReturnsBySale(organizationId, saleId, session);
      let total = 0n;
      for (const ret of posted) {
        for (const line of ret.lines ?? []) {
          if (Number(line.originalLineIndex) !== Number(originalLineIndex)) {
            continue;
          }
          if (batchId !== undefined) {
            const lineBatch = line.batchId ? String(line.batchId) : null;
            const wanted = batchId ? String(batchId) : null;
            if (lineBatch !== wanted) {
              continue;
            }
          }
          total += BigInt(String(line.quantityBaseMinorUnits ?? '0'));
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
  const correctiveTransactions = new Map();
  const audits = [];
  let seq = 1;
  let correctiveSeq = 1;

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
          if (filter.saleId && String(item.saleId) !== String(filter.saleId)) {
            return false;
          }
          if (filter.customerId && String(item.customerId) !== String(filter.customerId)) {
            return false;
          }
          if (filter.returnType && item.returnType !== filter.returnType) {
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

    async deleteReturnIfDraft(_session, organizationId, id) {
      const current = await this.findReturnById(organizationId, id);
      if (current === null || current.status !== 'draft') {
        return false;
      }
      returns.delete(id);
      return true;
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

    async updateReturnIfPostedUnreversed(_session, organizationId, id, expectedVersion, patch) {
      const current = await this.findReturnById(organizationId, id);
      if (current === null) {
        return null;
      }
      if (
        current.status !== 'posted' ||
        Number(current.version) !== Number(expectedVersion) ||
        (current.reversedByCorrectiveTransactionId !== null &&
          current.reversedByCorrectiveTransactionId !== undefined)
      ) {
        return null;
      }
      return this.updateReturn(_session, organizationId, id, {
        ...patch,
        version: expectedVersion + 1,
      });
    },

    async insertCorrectiveTransaction(_session, doc) {
      for (const existing of correctiveTransactions.values()) {
        if (
          String(existing.organizationId) === String(doc.organizationId) &&
          existing.sourceType === doc.sourceType &&
          String(existing.sourceId) === String(doc.sourceId)
        ) {
          const error = new Error('Corrective transaction already exists for this source');
          error.agrivioDuplicate = true;
          throw error;
        }
      }
      const id = `corrective-${correctiveSeq++}`;
      const now = new Date();
      const record = {
        _id: id,
        createdAt: now,
        updatedAt: now,
        ...doc,
      };
      correctiveTransactions.set(id, record);
      return { ...record };
    },

    async findCorrectiveTransactionBySource(organizationId, sourceType, sourceId) {
      for (const existing of correctiveTransactions.values()) {
        if (
          String(existing.organizationId) === String(organizationId) &&
          existing.sourceType === sourceType &&
          String(existing.sourceId) === String(sourceId)
        ) {
          return { ...existing };
        }
      }
      return null;
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

    async listPostedReturnsBySale(organizationId, saleId) {
      return [...returns.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.saleId) === String(saleId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) }));
    },

    async sumPostedReturnedQuantityBySaleLine(organizationId, saleId, originalLineIndex, batchId) {
      const posted = await this.listPostedReturnsBySale(organizationId, saleId);
      let total = 0n;
      for (const ret of posted) {
        for (const line of ret.lines ?? []) {
          if (Number(line.originalLineIndex) !== Number(originalLineIndex)) {
            continue;
          }
          if (batchId !== undefined) {
            const lineBatch = line.batchId ? String(line.batchId) : null;
            const wanted = batchId ? String(batchId) : null;
            if (lineBatch !== wanted) {
              continue;
            }
          }
          total += BigInt(String(line.quantityBaseMinorUnits ?? '0'));
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

    listCorrectiveTransactionsForTest() {
      return [...correctiveTransactions.values()].map((item) => ({ ...item }));
    },
  };
}

module.exports = {
  createMongooseReturnsStore,
  createInMemoryReturnsStore,
};
