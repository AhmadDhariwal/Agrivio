const { randomUUID } = require('node:crypto');

/**
 * Bridge onboarding identity collections with auth session/reset collections.
 */
function createBridgedAuthStore(deps) {
  const identity = deps.identityStore;
  const sessions = new Map();
  const resetTokens = new Map();

  async function listMembershipsByUserId(userId) {
    if (typeof identity.listMembershipsByUserId === 'function') {
      return identity.listMembershipsByUserId(userId);
    }
    return [];
  }

  async function findMembershipById(id) {
    if (typeof identity.findMembershipById === 'function') {
      return identity.findMembershipById(id);
    }
    return null;
  }

  return {
    findUserByEmailNormalized: (email) => identity.findUserByEmailNormalized(email),
    findUserById: (id) => identity.findUserById(id),
    insertUser: (session, doc) => identity.insertUser(session, doc),
    updateUser: (session, id, patch) => identity.updateUser(session, id, patch),
    listMembershipsByUserId,
    findMembershipById,
    insertMembership: (session, doc) => identity.insertMembership(session, doc),

    async findSessionByTokenHash(tokenHash) {
      return sessions.get(tokenHash) ?? null;
    },

    async insertSession(_session, doc) {
      const id = randomUUID();
      const record = {
        _id: id,
        ...doc,
      };
      sessions.set(String(doc['tokenHash']), record);
      return record;
    },

    async updateSession(_session, id, patch) {
      for (const [hash, record] of sessions.entries()) {
        if (String(record['_id']) !== String(id)) {
          continue;
        }
        const updated = {
          ...record,
          ...patch,
        };
        sessions.delete(hash);
        sessions.set(String(updated['tokenHash']), updated);
        return updated;
      }
      return null;
    },

    async revokeSessionByTokenHash(_session, tokenHash, revokedAt) {
      const existing = sessions.get(tokenHash);
      if (existing === undefined) {
        return null;
      }
      const updated = { ...existing, revokedAt };
      sessions.set(tokenHash, updated);
      return updated;
    },

    async revokeAllSessionsForUser(_session, userId, revokedAt) {
      for (const [hash, record] of sessions.entries()) {
        if (record.userId !== undefined && String(record.userId) === String(userId)) {
          sessions.set(hash, { ...record, revokedAt });
        }
      }
    },

    async insertPasswordResetToken(_session, doc) {
      const id = randomUUID();
      const record = { _id: id, ...doc };
      resetTokens.set(String(doc['tokenHash']), record);
      return record;
    },

    async findPasswordResetTokenByHash(tokenHash) {
      return resetTokens.get(tokenHash) ?? null;
    },

    async updatePasswordResetToken(_session, id, patch) {
      for (const [hash, record] of resetTokens.entries()) {
        if (String(record['_id']) !== String(id)) {
          continue;
        }
        const updated = { ...record, ...patch };
        resetTokens.delete(hash);
        resetTokens.set(String(updated['tokenHash']), updated);
        return updated;
      }
      return null;
    },

    appendAuditEvent: (session, event) => identity.appendAuditEvent(session, event),
    listAuditEventsForTest: () => identity.listAuditEventsForTest?.() ?? [],
  };
}

module.exports = {
  createBridgedAuthStore,
};
