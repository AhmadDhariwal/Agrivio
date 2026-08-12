const mongoose = require('mongoose');
const { PaymentModel } = require('./persistence/payment.model');
const { PaymentAllocationModel } = require('./persistence/payment-allocation.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function createMongoosePaymentsStore() {
  return {
    async insertPayment(session, doc) {
      try {
        const [created] = await PaymentModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async insertAllocation(session, doc) {
      try {
        const [created] = await PaymentAllocationModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async findPaymentById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return PaymentModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async listPayments(organizationId, filter = {}) {
      const query = { organizationId, status: 'posted', partyType: filter.partyType ?? 'supplier' };
      if (filter.partyType === 'supplier' && filter.supplierId) {
        query.supplierId = filter.supplierId;
      }
      if (filter.partyType === 'customer' && filter.customerId) {
        query.customerId = filter.customerId;
      }
      return PaymentModel.find(query).sort({ postedAt: -1 }).lean().exec();
    },

    async listAllocationsByPayment(organizationId, paymentId) {
      return PaymentAllocationModel.find({
        organizationId,
        paymentId,
        status: 'posted',
      })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
    },

    async listAllocationsByTarget(organizationId, targetType, targetId) {
      return PaymentAllocationModel.find({
        organizationId,
        targetType,
        targetId,
        status: 'posted',
      })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryPaymentsStore() {
  const payments = new Map();
  const allocations = new Map();
  const audits = [];
  let paymentSeq = 1;
  let allocationSeq = 1;

  return {
    async insertPayment(_session, doc) {
      const id = `payment-${paymentSeq++}`;
      const record = { _id: id, ...doc };
      payments.set(id, record);
      return { ...record };
    },

    async insertAllocation(_session, doc) {
      const id = `payment-allocation-${allocationSeq++}`;
      const record = { _id: id, ...doc };
      allocations.set(id, record);
      return { ...record };
    },

    async findPaymentById(organizationId, id) {
      const record = payments.get(id);
      if (!record || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async listPayments(organizationId, filter = {}) {
      const partyType = filter.partyType ?? 'supplier';
      return [...payments.values()]
        .filter((item) => {
          if (String(item.organizationId) !== String(organizationId)) {
            return false;
          }
          if (item.partyType !== partyType || item.status !== 'posted') {
            return false;
          }
          if (partyType === 'supplier' && filter.supplierId && String(item.supplierId) !== String(filter.supplierId)) {
            return false;
          }
          if (partyType === 'customer' && filter.customerId && String(item.customerId) !== String(filter.customerId)) {
            return false;
          }
          return true;
        })
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async listAllocationsByPayment(organizationId, paymentId) {
      return [...allocations.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.paymentId) === String(paymentId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }));
    },

    async listAllocationsByTarget(organizationId, targetType, targetId) {
      return [...allocations.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            item.targetType === targetType &&
            String(item.targetId) === String(targetId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }));
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listPaymentsForTest() {
      return [...payments.values()].map((item) => ({ ...item }));
    },

    listAllocationsForTest() {
      return [...allocations.values()].map((item) => ({ ...item }));
    },
  };
}

module.exports = {
  createMongoosePaymentsStore,
  createInMemoryPaymentsStore,
};
