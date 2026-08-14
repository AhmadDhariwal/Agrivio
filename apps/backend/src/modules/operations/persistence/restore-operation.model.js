const mongoose = require('mongoose');

const RESTORE_STATUSES = Object.freeze(['coordination_initiated', 'cancelled']);

const restoreOperationSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: RESTORE_STATUSES },
    requestedAt: { type: Date, required: true },
    actorId: { type: String, required: true },
    reason: { type: String, required: true },
    targetRef: { type: String, default: null },
    productionRestoreExecuted: { type: Boolean, required: true, default: false },
    verificationStatus: { type: String, required: true, default: 'pending' },
  },
  { timestamps: true, collection: 'restore_operation_records' },
);

restoreOperationSchema.index({ requestedAt: -1 });

const RestoreOperationModel =
  mongoose.models['RestoreOperation'] || mongoose.model('RestoreOperation', restoreOperationSchema);

module.exports = {
  RESTORE_STATUSES,
  RestoreOperationModel,
};
