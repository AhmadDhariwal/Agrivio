const mongoose = require('mongoose');
const { SubscriptionPlanModel } = require('./persistence/subscription-plan.model');
const { SubscriptionModel } = require('./persistence/subscription.model');
const { SubscriptionBillingRecordModel } = require('./persistence/subscription-billing-record.model');
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
      return SubscriptionPlanModel.find(query)
        .sort({ planCode: 1, planVersion: -1 })
        .lean()
        .exec();
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
      return SubscriptionBillingRecordModel.find(query)
        .sort({ submittedAt: -1 })
        .lean()
        .exec();
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

    async updateBillingRecord(session, id, patch) {
      return SubscriptionBillingRecordModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createMongooseTransactionSessionPort() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

module.exports = {
  createMongooseSubscriptionStore,
  createMongooseTransactionSessionPort,
};
