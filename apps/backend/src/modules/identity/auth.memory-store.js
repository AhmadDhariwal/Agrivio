const { randomUUID } = require('node:crypto');

function createInMemoryAuthStore() {
  const users = new Map();
  const memberships = new Map();
  const sessions = new Map();
  const resetTokens = new Map();
  const audits = [];

  return {
    async findUserByEmailNormalized(emailNormalized) {
      for (const user of users.values()) {
        if (user['emailNormalized'] === emailNormalized) {
          return user;
        }
      }
      return null;
    },

    async findUserById(id) {
      return users.get(String(id)) ?? null;
    },

    async insertUser(_session, doc) {
      const id = randomUUID();
      const record = { _id: id, ...doc };
      users.set(id, record);
      return record;
    },

    async updateUser(_session, id, patch) {
      const existing = users.get(String(id));
      if (existing === undefined) {
        return null;
      }
      const updated = { ...existing, ...patch };
      users.set(String(id), updated);
      return updated;
    },

    async listMembershipsByUserId(userId) {
      return [...memberships.values()].filter((item) => String(item['userId']) === String(userId));
    },

    async findMembershipById(id) {
      return memberships.get(String(id)) ?? null;
    },

    async insertMembership(_session, doc) {
      const id = randomUUID();
      const record = { _id: id, ...doc };
      memberships.set(id, record);
      return record;
    },

    async findSessionByTokenHash(tokenHash) {
      return sessions.get(tokenHash) ?? null;
    },

    async insertSession(_session, doc) {
      const id = randomUUID();
      const record = { _id: id, ...doc };
      sessions.set(String(doc['tokenHash']), record);
      return record;
    },

    async updateSession(_session, id, patch) {
      for (const [hash, record] of sessions.entries()) {
        if (String(record['_id']) !== String(id)) {
          continue;
        }
        const updated = { ...record, ...patch };
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

    async appendAuditEvent(_session, event) {
      audits.push(event);
    },

    listAuditEventsForTest() {
      return audits;
    },

    /**
     * Test helper: seed an active user.
     */
    seedUser(doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      users.set(id, record);
      return record;
    },

    /**
     * Test helper: seed a membership.
     */
    seedMembership(doc) {
      const id = String(doc['_id'] ?? randomUUID());
      const record = { ...doc, _id: id };
      memberships.set(id, record);
      return record;
    },
  };
}

module.exports = {
  createInMemoryAuthStore,
};
