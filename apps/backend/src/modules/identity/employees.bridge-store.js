/**
 * Bridge employees operations onto onboarding identity + auth session stores for memory tests.
 */
function createBridgedEmployeesStore(deps) {
  const identity = deps.identityStore;
  const authStore = deps.authStore;
  const locationsStore = deps.locationsStore;

  return {
    async listMembershipsByOrganizationId(organizationId) {
      if (typeof identity.listMembershipsByOrganizationId === 'function') {
        return identity.listMembershipsByOrganizationId(organizationId);
      }
      if (typeof identity.listMembershipsByUserId !== 'function') {
        return [];
      }
      // Fallback: scan via known users is not available; prefer explicit method.
      return [];
    },

    async listMembershipsPage(organizationId, filter = {}, pagination = {}) {
      const all = await this.listMembershipsByOrganizationId(organizationId);
      const search = String(filter.search ?? '').trim().toLowerCase();
      const withUsers = [];
      for (const membership of all) {
        const user = await this.findUserById(String(membership.userId));
        if (user && (!search || String(user.emailNormalized).startsWith(search))) {
          withUsers.push({ ...membership, user });
        }
      }
      withUsers.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b._id).localeCompare(String(a._id)));
      const total = withUsers.length;
      const skip = pagination.skip ?? 0;
      return { items: withUsers.slice(skip, skip + (pagination.pageSize ?? 25)), total };
    },

    async countActiveUsers(organizationId) {
      const memberships = await this.listMembershipsByOrganizationId(organizationId);
      return memberships.filter(
        (item) => item.status === 'active' || item.status === 'pending',
      ).length;
    },

    async findMembershipByOrganizationAndUserId(organizationId, userId) {
      if (typeof identity.findMembership === 'function') {
        return identity.findMembership(organizationId, userId);
      }
      return null;
    },

    async findMembershipsWithUsersByUserIds(organizationId, userIds) {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
      }
      const idSet = new Set(userIds.map(String));
      const all = await this.listMembershipsByOrganizationId(organizationId);
      const results = [];
      for (const membership of all) {
        const userId = String(membership.userId);
        if (!idSet.has(userId)) {
          continue;
        }
        const user = await this.findUserById(userId);
        if (user) {
          results.push({ ...membership, user });
        }
      }
      return results;
    },

    async findMembershipById(organizationId, membershipId) {
      const membership = await identity.findMembershipById(membershipId);
      if (membership === null || String(membership.organizationId) !== String(organizationId)) {
        return null;
      }
      return membership;
    },

    async listMembershipsByOrganization(organizationId) {
      return this.listMembershipsByOrganizationId(organizationId);
    },

    findUserById: (id) => identity.findUserById(id),
    findUserByEmailNormalized: (email) => identity.findUserByEmailNormalized(email),
    insertUser: (session, doc) => identity.insertUser(session, doc),
    updateUser: (session, id, patch) => identity.updateUser(session, id, patch),
    insertMembership: (session, doc) => identity.insertMembership(session, doc),
    updateMembership: (session, id, patch) => identity.updateMembership(session, id, patch),
    insertActivationToken: (session, doc) => identity.insertActivationToken(session, doc),

    async consumeOpenActivationTokens(session, userId, organizationId, consumedAt) {
      if (typeof identity.listOpenActivationTokens === 'function') {
        const open = await identity.listOpenActivationTokens({ userId, organizationId });
        for (const token of open) {
          await identity.updateActivationToken(session, String(token['_id']), { consumedAt });
        }
        return;
      }
      if (typeof identity.consumeOpenActivationTokens === 'function') {
        await identity.consumeOpenActivationTokens(session, userId, organizationId, consumedAt);
      }
    },

    async listAccessAssignmentsByMembershipId(membershipId) {
      if (
        locationsStore &&
        typeof locationsStore.listAccessAssignmentsByMembershipOnly === 'function'
      ) {
        return locationsStore.listAccessAssignmentsByMembershipOnly(membershipId);
      }
      if (typeof authStore.listAccessAssignmentsByMembershipId === 'function') {
        return authStore.listAccessAssignmentsByMembershipId(membershipId);
      }
      return [];
    },

    async revokeAccessAssignmentsForMembership(session, membershipId, revokedAt) {
      if (typeof this.listAccessAssignmentsByMembershipId !== 'function') {
        return;
      }
      const active = await this.listAccessAssignmentsByMembershipId(membershipId);
      if (
        locationsStore &&
        typeof locationsStore.updateAccessAssignment === 'function'
      ) {
        for (const assignment of active) {
          await locationsStore.updateAccessAssignment(session, String(assignment['_id']), {
            status: 'revoked',
            version: Number(assignment['version'] ?? 1) + 1,
          });
        }
        return revokedAt;
      }
      if (typeof authStore.updateAccessAssignment === 'function') {
        for (const assignment of active) {
          await authStore.updateAccessAssignment(session, String(assignment['_id']), {
            status: 'revoked',
            version: Number(assignment['version'] ?? 1) + 1,
          });
        }
      }
      return revokedAt;
    },

    async revokeAllSessionsForUser(session, userId, revokedAt) {
      return authStore.revokeAllSessionsForUser(session, userId, revokedAt);
    },

    appendAuditEvent: (session, event) => identity.appendAuditEvent(session, event),
  };
}

module.exports = {
  createBridgedEmployeesStore,
};
