// @ts-check
const { randomUUID } = require('node:crypto');

/**
 * In-memory persistence for F02 Phase 1 unit tests (no invented activation-request collection).
 * @returns {import('./onboarding.types').OnboardingStore}
 */
function createInMemoryOnboardingStore() {
  /** @type {Map<string, Record<string, unknown>>} */
  const organizations = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const users = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const memberships = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const subscriptions = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const activationTokens = new Map();
  /** @type {Record<string, unknown>[]} */
  const auditEvents = [];

  return {
    async findOrganizationByFingerprint(fingerprint) {
      for (const org of organizations.values()) {
        if (org['applicantFingerprint'] === fingerprint) {
          return { ...org };
        }
      }
      return null;
    },

    async findOrganizationById(id) {
      const org = organizations.get(id);
      return org === undefined ? null : { ...org };
    },

    async listOrganizations(filter = {}) {
      return [...organizations.values()]
        .filter((org) => {
          if (filter.status !== undefined && org['status'] !== filter.status) {
            return false;
          }
          return true;
        })
        .map((org) => ({ ...org }));
    },

    async insertOrganization(_session, doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      organizations.set(id, record);
      return { ...record };
    },

    async updateOrganization(_session, id, patch) {
      const existing = organizations.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      organizations.set(id, next);
      return { ...next };
    },

    async findUserByEmailNormalized(emailNormalized) {
      for (const user of users.values()) {
        if (user['emailNormalized'] === emailNormalized) {
          return { ...user };
        }
      }
      return null;
    },

    async findUserById(id) {
      const user = users.get(id);
      return user === undefined ? null : { ...user };
    },

    async insertUser(_session, doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      users.set(id, record);
      return { ...record };
    },

    async updateUser(_session, id, patch) {
      const existing = users.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      users.set(id, next);
      return { ...next };
    },

    async findMembership(organizationId, userId) {
      for (const membership of memberships.values()) {
        if (
          membership['organizationId'] === organizationId &&
          membership['userId'] === userId
        ) {
          return { ...membership };
        }
      }
      return null;
    },

    async insertMembership(_session, doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      memberships.set(id, record);
      return { ...record };
    },

    async updateMembership(_session, id, patch) {
      const existing = memberships.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      memberships.set(id, next);
      return { ...next };
    },

    async findSubscriptionByOrganizationId(organizationId) {
      for (const subscription of subscriptions.values()) {
        if (subscription['organizationId'] === organizationId) {
          return { ...subscription };
        }
      }
      return null;
    },

    async insertSubscription(_session, doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      subscriptions.set(id, record);
      return { ...record };
    },

    async updateSubscription(_session, id, patch) {
      const existing = subscriptions.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      subscriptions.set(id, next);
      return { ...next };
    },

    async findActivationTokenByHash(tokenHash) {
      for (const token of activationTokens.values()) {
        if (token['tokenHash'] === tokenHash) {
          return { ...token };
        }
      }
      return null;
    },

    async insertActivationToken(_session, doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      activationTokens.set(id, record);
      return { ...record };
    },

    async updateActivationToken(_session, id, patch) {
      const existing = activationTokens.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      activationTokens.set(id, next);
      return { ...next };
    },

    async appendAuditEvent(_session, event) {
      auditEvents.push({ ...event, _immutable: true });
    },

    listAuditEventsForTest() {
      return auditEvents.map((event) => ({ ...event }));
    },
  };
}

module.exports = {
  createInMemoryOnboardingStore,
};
