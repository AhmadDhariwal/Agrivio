const mongoose = require('mongoose');

const BACKUP_STATUSES = Object.freeze(['running', 'success', 'failed']);

const backupOperationSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: BACKUP_STATUSES },
    recordedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    databaseName: { type: String, default: null },
    failureMessage: { type: String, default: null },
    providerRef: { type: String, default: null },
    policyRef: { type: String, default: null },
    filename: { type: String, default: null },
    fileSizeBytes: { type: Number, default: null },
    sha256: { type: String, default: null },
    manifestVerified: { type: Boolean, default: false },
    checksumVerified: { type: Boolean, default: false },
    retentionDays: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    restoreReady: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'backup_operation_records' },
);

backupOperationSchema.index({ recordedAt: -1 });
backupOperationSchema.index({ status: 1, recordedAt: -1 });
backupOperationSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'running' } },
);

const BackupOperationModel =
  mongoose.models['BackupOperation'] || mongoose.model('BackupOperation', backupOperationSchema);

module.exports = {
  BACKUP_STATUSES,
  BackupOperationModel,
};
