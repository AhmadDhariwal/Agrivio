const mongoose = require('mongoose');

const IMPORT_JOB_STATUSES = [
  'created',
  'uploaded',
  'previewed',
  'confirmed',
  'executing',
  'completed',
  'failed',
];

const importJobSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    importType: { type: String, required: true },
    templateVersion: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      required: true,
      enum: IMPORT_JOB_STATUSES,
      default: 'created',
    },
    storageRef: { type: String, default: '' },
    originalFileName: { type: String, default: '' },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    checksum: { type: String, default: '' },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: String, default: null },
    preview: { type: mongoose.Schema.Types.Mixed, default: null },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
    executedAt: { type: Date, default: null },
    executedBy: { type: String, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    failureMessage: { type: String, default: '' },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'import_jobs' },
);

importJobSchema.index({ organizationId: 1, createdAt: -1 });
importJobSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const ImportJobModel =
  mongoose.models['ImportJob'] || mongoose.model('ImportJob', importJobSchema);

const importRowErrorSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    importJobId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ImportJob',
      index: true,
    },
    rowNumber: { type: Number, required: true },
    field: { type: String, required: true },
    code: { type: String, default: '' },
    message: { type: String, required: true },
  },
  { timestamps: true, collection: 'import_row_errors' },
);

importRowErrorSchema.index({ organizationId: 1, importJobId: 1, rowNumber: 1 });

const ImportRowErrorModel =
  mongoose.models['ImportRowError'] || mongoose.model('ImportRowError', importRowErrorSchema);

module.exports = {
  IMPORT_JOB_STATUSES,
  ImportJobModel,
  ImportRowErrorModel,
};
