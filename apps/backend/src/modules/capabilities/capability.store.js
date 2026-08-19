const { randomUUID } = require('node:crypto');
const {
  OrganizationCapabilityPolicyModel,
} = require('./persistence/organization-capability-policy.model');

function clonePolicy(policy) {
  return policy === null
    ? null
    : {
        ...policy,
        overrides: (policy.overrides ?? []).map((override) => ({
          key: override.key,
          value: { ...override.value },
        })),
      };
}

function createInMemoryCapabilityPolicyStore() {
  const policies = new Map();

  return {
    async findByOrganizationId(organizationId) {
      return clonePolicy(policies.get(String(organizationId)) ?? null);
    },

    async insert(_session, doc) {
      const organizationId = String(doc.organizationId);
      if (policies.has(organizationId)) {
        const error = new Error('Organization capability policy already exists');
        error.agrivioDuplicate = true;
        throw error;
      }
      const record = {
        ...doc,
        _id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      policies.set(organizationId, record);
      return clonePolicy(record);
    },

    async update(_session, organizationId, expectedVersion, patch) {
      const current = policies.get(String(organizationId));
      if (current === undefined || Number(current.version) !== Number(expectedVersion)) {
        return null;
      }
      const updated = { ...current, ...patch, updatedAt: new Date() };
      policies.set(String(organizationId), updated);
      return clonePolicy(updated);
    },
  };
}

function createMongooseCapabilityPolicyStore() {
  return {
    async findByOrganizationId(organizationId) {
      return OrganizationCapabilityPolicyModel.findOne({ organizationId }).lean().exec();
    },

    async insert(session, doc) {
      try {
        const [created] = await OrganizationCapabilityPolicyModel.create(
          [doc],
          session ? { session } : undefined,
        );
        return created.toObject();
      } catch (error) {
        if (error && error.code === 11000) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async update(session, organizationId, expectedVersion, patch) {
      return OrganizationCapabilityPolicyModel.findOneAndUpdate(
        { organizationId, version: expectedVersion },
        { $set: patch },
        { new: true, ...(session ? { session } : {}) },
      )
        .lean()
        .exec();
    },
  };
}

module.exports = {
  createInMemoryCapabilityPolicyStore,
  createMongooseCapabilityPolicyStore,
};
