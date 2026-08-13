const mongoose = require('mongoose');

const CORRECTIVE_SOURCE_TYPES = ['return'];
const CORRECTIVE_STATUSES = ['posted'];

const correctiveTransactionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    sourceType: {
      type: String,
      required: true,
      enum: CORRECTIVE_SOURCE_TYPES,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reversalOfId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reason: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: CORRECTIVE_STATUSES,
      default: 'posted',
    },
    postedAt: { type: Date, required: true },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  { timestamps: true, collection: 'corrective_transactions' },
);

correctiveTransactionSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1 },
  { unique: true, name: 'corrective_transactions_source_unique' },
);
correctiveTransactionSchema.index({ organizationId: 1, reversalOfId: 1 });

const CorrectiveTransactionModel =
  mongoose.models['CorrectiveTransaction'] ||
  mongoose.model('CorrectiveTransaction', correctiveTransactionSchema);

module.exports = {
  CORRECTIVE_SOURCE_TYPES,
  CORRECTIVE_STATUSES,
  CorrectiveTransactionModel,
};
