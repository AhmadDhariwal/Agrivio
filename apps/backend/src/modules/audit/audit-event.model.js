// @ts-check
const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, index: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    reason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false, collection: 'audit_events' },
);

/** @type {import('mongoose').Model<any>} */
const AuditEventModel =
  mongoose.models['AuditEvent'] || mongoose.model('AuditEvent', auditEventSchema);

/**
 * @returns {{ append: (session: unknown, event: Record<string, unknown>) => Promise<void> }}
 */
function createMongooseAuditEventStore() {
  return {
    async append(session, event) {
      await AuditEventModel.create([event], session ? { session } : undefined);
    },
  };
}

module.exports = {
  AuditEventModel,
  createMongooseAuditEventStore,
};
