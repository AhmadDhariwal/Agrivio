const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, index: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    reason: { type: String },
    requestId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false, collection: 'audit_events' },
);

auditEventSchema.index({ organizationId: 1, occurredAt: -1 });
auditEventSchema.index({ organizationId: 1, actorId: 1, occurredAt: -1 });
auditEventSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });
auditEventSchema.index({ occurredAt: -1 });

const AuditEventModel =
  mongoose.models['AuditEvent'] || mongoose.model('AuditEvent', auditEventSchema);

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
