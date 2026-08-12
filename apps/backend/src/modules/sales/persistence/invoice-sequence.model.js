const mongoose = require('mongoose');

const invoiceSequenceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Branch',
    },
    nextSequenceNumber: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'invoice_sequences' },
);

invoiceSequenceSchema.index({ organizationId: 1, branchId: 1 }, { unique: true });

const InvoiceSequenceModel =
  mongoose.models['InvoiceSequence'] ||
  mongoose.model('InvoiceSequence', invoiceSequenceSchema);

module.exports = {
  InvoiceSequenceModel,
};
