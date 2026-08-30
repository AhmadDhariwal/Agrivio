const mongoose = require('mongoose');
const { SubscriptionPlanModel } = require('./persistence/subscription-plan.model');
const { SubscriptionModel } = require('./persistence/subscription.model');
const {
  SubscriptionBillingRecordModel,
} = require('./persistence/subscription-billing-record.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function createMongooseSubscriptionStore() {
  return {
    async listPlans(filter = {}) {
      const query = {};
      if (filter.status !== undefined) {
        query.status = filter.status;
      }
      if (filter.planCode !== undefined) {
        query.planCode = filter.planCode;
      }
      return SubscriptionPlanModel.find(query).sort({ planCode: 1, planVersion: -1 }).lean().exec();
    },

    async findPlanById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return SubscriptionPlanModel.findById(id).lean().exec();
    },

    async findPlanByCodeVersion(planCode, planVersion) {
      return SubscriptionPlanModel.findOne({ planCode, planVersion }).lean().exec();
    },

    async findActivePlanByCode(planCode) {
      return SubscriptionPlanModel.findOne({ planCode, status: 'active' }).lean().exec();
    },

    async nextPlanVersion(planCode) {
      const latest = await SubscriptionPlanModel.findOne({ planCode })
        .sort({ planVersion: -1 })
        .select({ planVersion: 1 })
        .lean()
        .exec();
      return latest === null ? 1 : Number(latest.planVersion) + 1;
    },

    async insertPlan(session, doc) {
      const [created] = await SubscriptionPlanModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updatePlan(session, id, patch) {
      return SubscriptionPlanModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async findSubscriptionById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return SubscriptionModel.findById(id).lean().exec();
    },

    async findSubscriptionByOrganizationId(organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return null;
      }
      return SubscriptionModel.findOne({ organizationId }).lean().exec();
    },

    async listSubscriptions() {
      return SubscriptionModel.find({}).sort({ updatedAt: -1 }).lean().exec();
    },

    async insertSubscription(session, doc) {
      const [created] = await SubscriptionModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateSubscription(session, id, patch) {
      return SubscriptionModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async findBillingRecordById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return SubscriptionBillingRecordModel.findById(id).lean().exec();
    },

    async listBillingRecords(filter = {}) {
      const query = {};
      if (filter.organizationId !== undefined) {
        query.organizationId = filter.organizationId;
      }
      if (filter.status !== undefined) {
        query.status = filter.status;
      }
      if (filter.q !== undefined && String(filter.q).trim() !== '') {
        const needle = String(filter.q).trim();
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { paymentReferenceNormalized: { $regex: escaped, $options: 'i' } },
          { requestedPlanCode: { $regex: escaped, $options: 'i' } },
          { notes: { $regex: escaped, $options: 'i' } },
        ];
        if (mongoose.isValidObjectId(needle)) {
          query.$or.push({ organizationId: needle });
        }
        const organizationIdsForSearch = (filter.organizationIdsForSearch ?? []).filter((id) =>
          mongoose.isValidObjectId(id),
        );
        if (organizationIdsForSearch.length > 0) {
          query.$or.push({ organizationId: { $in: organizationIdsForSearch } });
        }
      }
      const offset = Number.isInteger(filter.offset) && filter.offset > 0 ? filter.offset : 0;
      const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : null;
      const found = SubscriptionBillingRecordModel.find(query).sort({ submittedAt: -1 });
      const [total, items] = await Promise.all([
        SubscriptionBillingRecordModel.countDocuments(query).exec(),
        (limit === null ? found.skip(offset) : found.skip(offset).limit(limit)).lean().exec(),
      ]);
      return { items, total, offset, limit };
    },

    async countBillingByPaymentReference(paymentMethod, paymentReferenceNormalized) {
      return SubscriptionBillingRecordModel.countDocuments({
        paymentMethod,
        paymentReferenceNormalized,
      }).exec();
    },

    async insertBillingRecord(session, doc) {
      const [created] = await SubscriptionBillingRecordModel.create([doc], withSession(session));
      return created.toObject();
    },

    async updateBillingRecord(session, id, patch, expectedVersion) {
      const query = {
        _id: id,
        ...(expectedVersion === undefined ? {} : { version: expectedVersion }),
      };
      return SubscriptionBillingRecordModel.findOneAndUpdate(
        query,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      const doc = { ...event };
      if (
        doc.organizationId !== undefined &&
        doc.organizationId !== null &&
        !mongoose.isValidObjectId(doc.organizationId)
      ) {
        doc.organizationId = undefined;
      }
      await AuditEventModel.create([doc], withSession(session));
    },
  };
}

function createMongooseTransactionSessionPort() {
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

module.exports = {
  createMongooseSubscriptionStore,
  createMongooseTransactionSessionPort,
};
