// @ts-check
import mongoose from 'mongoose';

/**
 * @typedef {{
 *   _id: mongoose.Types.ObjectId;
 *   organizationId?: mongoose.Types.ObjectId;
 *   actorId: string;
 *   action: string;
 *   resourceType: string;
 *   resourceId?: string;
 *   reason?: string;
 *   metadata?: Record<string, unknown>;
 *   occurredAt: Date;
 * }} AuditEventDocument
 */

const auditEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: null },
    reason: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, required: true, default: () => new Date() },
  },
  {
    timestamps: false,
    collection: 'audit_events',
  },
);

auditEventSchema.index({ organizationId: 1, occurredAt: -1 });
auditEventSchema.index({ actorId: 1, occurredAt: -1 });
auditEventSchema.index({ action: 1, occurredAt: -1 });

export const AuditEventModel = mongoose.model('AuditEvent', auditEventSchema);
