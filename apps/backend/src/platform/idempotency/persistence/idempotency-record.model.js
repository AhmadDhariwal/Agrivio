const mongoose = require('mongoose');

const IDEMPOTENCY_STATES = Object.freeze(['in_progress', 'completed', 'failed']);
const IDEMPOTENCY_SCOPE_TYPES = Object.freeze(['organization', 'platform', 'public']);

const idempotencyRecordSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      required: true,
      enum: IDEMPOTENCY_SCOPE_TYPES,
    },
    organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorId: { type: String, required: true },
    operation: { type: String, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: {
      type: String,
      required: true,
      enum: IDEMPOTENCY_STATES,
      default: 'in_progress',
    },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'idempotency_records' },
);

idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

idempotencyRecordSchema.index(
  { organizationId: 1, actorId: 1, operation: 1, keyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: 'organization' },
  },
);

idempotencyRecordSchema.index(
  { actorId: 1, operation: 1, keyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: 'platform' },
  },
);

idempotencyRecordSchema.index(
  { actorId: 1, operation: 1, keyHash: 1 },
  {
    unique: true,
    name: 'idempotency_public_claim_unique',
    partialFilterExpression: { scopeType: 'public' },
  },
);

const IdempotencyRecordModel =
  mongoose.models['IdempotencyRecord'] ||
  mongoose.model('IdempotencyRecord', idempotencyRecordSchema);

module.exports = {
  IDEMPOTENCY_STATES,
  IDEMPOTENCY_SCOPE_TYPES,
  IdempotencyRecordModel,
};
