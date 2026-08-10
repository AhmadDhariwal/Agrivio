const { OrganizationSettingsModel } = require('./persistence/organization-settings.model');
const mongoose = require('mongoose');

function withSession(session) {
  return session ? { session: session } : {};
}

function createMongooseSettingsStore() {
  return {
    async findByOrganizationId(organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        return null;
      }
      return OrganizationSettingsModel.findOne({ organizationId }).lean().exec();
    },

    async insert(session, doc) {
      const [created] = await OrganizationSettingsModel.create([doc], withSession(session));
      return created.toObject();
    },

    async update(session, id, patch) {
      return OrganizationSettingsModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async appendAuditEvent(session, event) {
      const { AuditEventModel } = require('../audit/persistence/audit-event.model');
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemorySettingsStore() {
  const records = new Map();
  const audits = [];
  let seq = 1;

  return {
    async findByOrganizationId(organizationId) {
      for (const record of records.values()) {
        if (String(record.organizationId) === String(organizationId)) {
          return { ...record };
        }
      }
      return null;
    },

    async insert(_session, doc) {
      const id = `settings-${seq++}`;
      const record = { _id: id, ...doc };
      records.set(id, record);
      return { ...record };
    },

    async update(_session, id, patch) {
      const existing = records.get(id);
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...patch };
      records.set(id, next);
      return { ...next };
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },
  };
}

module.exports = {
  createMongooseSettingsStore,
  createInMemorySettingsStore,
};
