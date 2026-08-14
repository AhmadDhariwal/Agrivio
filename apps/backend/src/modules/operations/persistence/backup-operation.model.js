const mongoose = require('mongoose');

const BACKUP_STATUSES = Object.freeze(['running', 'success', 'failed']);

const backupOperationSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: BACKUP_STATUSES },
    recordedAt: { type: Date, required: true },
    failureMessage: { type: String, default: null },
    providerRef: { type: String, default: null },
    policyRef: { type: String, default: null },
  },
  { timestamps: true, collection: 'backup_operation_records' },
);

backupOperationSchema.index({ recordedAt: -1 });
backupOperationSchema.index({ status: 1, recordedAt: -1 });

const BackupOperationModel =
  mongoose.models['BackupOperation'] || mongoose.model('BackupOperation', backupOperationSchema);

module.exports = {
  BACKUP_STATUSES,
  BackupOperationModel,
};
