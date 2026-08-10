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

    async revokeAllSessionsForUser(session, userId, revokedAt) {
      return authStore.revokeAllSessionsForUser(session, userId, revokedAt);
    },

    appendAuditEvent: (session, event) => identity.appendAuditEvent(session, event),
  };
}

module.exports = {
  createBridgedEmployeesStore,
};
