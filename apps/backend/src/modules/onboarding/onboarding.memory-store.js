const { randomUUID } = require('node:crypto');

/**
 * In-memory persistence for F02 Phase 1 unit tests (no invented activation-request collection).
 */
function createInMemoryOnboardingStore() {
  const organizations = new Map();
  const users = new Map();
  const memberships = new Map();
  const subscriptions = new Map();
  let platformSubscriptionStore = null;
  const activationTokens = new Map();
  const auditEvents = [];

  return {
    setPlatformSubscriptionStore(nextStore) {
      platformSubscriptionStore = nextStore;
    },
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

    async findOrganizationsByIds(ids) {
      return ids
        .map((id) => organizations.get(String(id)))
        .filter((organization) => organization !== undefined)
        .map((organization) => ({ ...organization }));
    },

    async findOrganizationIdsBySearch(search) {
      const needle = String(search ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (needle === '') {
        return [];
      }
      return [...organizations.values()]
        .filter((organization) => String(organization.nameNormalized).includes(needle))
        .map((organization) => String(organization._id));
    },

    async listOrganizations(filter = {}) {
      let items = [...organizations.values()]
        .filter((org) => {
          if (filter.status !== undefined && org['status'] !== filter.status) {
            return false;
          }
          const search = String(filter.search ?? '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
          if (search && !String(org.nameNormalized).includes(search)) return false;
          return true;
        })
        .map((org) => ({ ...org }));
      items.sort(
        (a, b) =>
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) ||
          String(b._id).localeCompare(String(a._id)),
      );
      const total = items.length;
      if (filter.skip !== undefined || filter.pageSize !== undefined)
        items = items.slice(filter.skip ?? 0, (filter.skip ?? 0) + (filter.pageSize ?? 25));
      return { items, total };
    },

    async listPlatformOrganizations(filter = {}) {
      const subscriptionRows =
        platformSubscriptionStore &&
        typeof platformSubscriptionStore.listSubscriptions === 'function'
          ? await platformSubscriptionStore.listSubscriptions()
          : [...subscriptions.values()];
      let items = [...organizations.values()].filter((organization) => {
        const subscription = subscriptionRows.find(
          (item) => String(item.organizationId) === String(organization._id),
        );
        if (filter.status && organization.status !== filter.status) return false;
        if (filter.plan && subscription?.planCode !== filter.plan) return false;
        if (filter.subscriptionStatus && subscription?.status !== filter.subscriptionStatus)
          return false;
        if (
          filter.search &&
          !String(organization.nameNormalized).includes(filter.search.toLowerCase())
        )
          return false;
        const createdAt = organization.createdAt ? new Date(organization.createdAt) : null;
        if (filter.createdFrom && (createdAt === null || createdAt < filter.createdFrom))
          return false;
        if (filter.createdTo && (createdAt === null || createdAt > filter.createdTo)) return false;
        return true;
      });
      const direction = filter.direction === 'asc' ? 1 : -1;
      const field = filter.sort ?? 'createdAt';
      items.sort(
        (a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * direction,
      );
      const total = items.length;
      items = items.slice(filter.skip ?? 0, (filter.skip ?? 0) + (filter.pageSize ?? 25));
      return {
        total,
        items: items.map((organization) => {
          const owner = users.get(String(organization.ownerUserId));
          const subscription = subscriptionRows.find(
            (item) => String(item.organizationId) === String(organization._id),
          );
          const organizationMemberships = [...memberships.values()].filter(
            (item) => String(item.organizationId) === String(organization._id),
          );
          return {
            ...organization,
            _platformSummary: true,
            ownerEmail: owner?.email ?? null,
            ownerStatus: owner?.status ?? null,
            ownerNeedsActivation: owner?.status === 'pending_activation' && !owner?.passwordHash,
            subscription: subscription
              ? {
                  id: String(subscription._id),
                  status: subscription.status,
                  planCode: subscription.planCode,
                  planVersion: subscription.planVersion,
                  version: subscription.version,
                }
              : null,
            employeeCount: organizationMemberships.length,
            ownerCount: organizationMemberships.filter((item) => item.role === 'Owner').length,
            branchCount: 0,
            warehouseCount: 0,
          };
        }),
      };
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

    async updateOrganizationIfVersion(_session, id, expectedVersion, patch) {
      const existing = organizations.get(id);
      if (existing === undefined || Number(existing.version) !== Number(expectedVersion)) {
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

    async findUsersByIds(ids) {
      return ids
        .map((id) => users.get(String(id)))
        .filter((user) => user !== undefined)
        .map((user) => ({ ...user }));
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
        if (membership['organizationId'] === organizationId && membership['userId'] === userId) {
          return { ...membership };
        }
      }
      return null;
    },

    async listMembershipsByUserId(userId) {
      return [...memberships.values()]
        .filter((membership) => membership['userId'] === userId)
        .map((membership) => ({ ...membership }));
    },

    async listMembershipsByOrganizationId(organizationId) {
      return [...memberships.values()]
        .filter((membership) => String(membership['organizationId']) === String(organizationId))
        .map((membership) => ({ ...membership }));
    },

    async findMembershipById(id) {
      const membership = memberships.get(String(id));
      return membership === undefined ? null : { ...membership };
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

    async listOpenActivationTokens(filter) {
      return [...activationTokens.values()]
        .filter((token) => {
          if (String(token['userId']) !== String(filter.userId)) {
            return false;
          }
          if (String(token['organizationId']) !== String(filter.organizationId)) {
            return false;
          }
          return token['consumedAt'] === undefined || token['consumedAt'] === null;
        })
        .map((token) => ({ ...token }));
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
