import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const {
  parseRepairArguments,
  repairOrganizationSubscription,
} = require('../../apps/backend/src/modules/subscriptions/subscription-repair');

function createMongoStore(mongoose, models) {
  return {
    async findOrganizationById(id, session) {
      if (!mongoose.isValidObjectId(id)) return null;
      return models.OrganizationModel.findById(id)
        .session(session ?? null)
        .lean()
        .exec();
    },
    async findSubscriptionByOrganizationId(id, session) {
      if (!mongoose.isValidObjectId(id)) return null;
      return models.SubscriptionModel.findOne({ organizationId: id })
        .session(session ?? null)
        .lean()
        .exec();
    },
    async findActiveStarterPlan() {
      return models.SubscriptionPlanModel.findOne({ planCode: 'Starter', status: 'active' })
        .lean()
        .exec();
    },
    async insertSubscription(session, doc) {
      const [created] = await models.SubscriptionModel.create([doc], { session });
      return created.toObject();
    },
    async markPlanReferenced(session, plan, at) {
      if (plan.referencedAt) return;
      await models.SubscriptionPlanModel.updateOne(
        { _id: plan._id, referencedAt: null },
        { $set: { referencedAt: at, version: Number(plan.version ?? 1) + 1 } },
        { session, runValidators: true },
      ).exec();
    },
    async appendAuditEvent(session, event) {
      await models.AuditEventModel.create([event], { session });
    },
    async runInTransaction(work) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(() => work(session));
      } finally {
        await session.endSession();
      }
    },
  };
}

async function main() {
  try {
    const { loadEnvFile } = await import('node:process');
    loadEnvFile?.('.env.local');
  } catch {}
  const args = parseRepairArguments(process.argv.slice(2));
  const mongoose = require('mongoose');
  const { loadApiEnv } = require('../../apps/backend/src/platform/config/runtime-config');
  const {
    OrganizationModel,
  } = require('../../apps/backend/src/modules/organizations/persistence/organization.model');
  const {
    SubscriptionModel,
  } = require('../../apps/backend/src/modules/subscriptions/persistence/subscription.model');
  const {
    SubscriptionPlanModel,
  } = require('../../apps/backend/src/modules/subscriptions/persistence/subscription-plan.model');
  const {
    AuditEventModel,
  } = require('../../apps/backend/src/modules/audit/persistence/audit-event.model');
  const config = loadApiEnv();
  await mongoose.connect(config.mongodbUri, { dbName: config.mongodbDbName });
  try {
    const result = await repairOrganizationSubscription({
      ...args,
      store: createMongoStore(mongoose, {
        OrganizationModel,
        SubscriptionModel,
        SubscriptionPlanModel,
        AuditEventModel,
      }),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[subscription-repair] ${error.message}`);
    process.exitCode = 1;
  });
}
