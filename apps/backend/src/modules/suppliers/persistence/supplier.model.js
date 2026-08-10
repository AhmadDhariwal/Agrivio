const mongoose = require('mongoose');

const SUPPLIER_STATUSES = ['active', 'inactive'];

const supplierSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    phone: { type: String, trim: true, default: '' },
    phoneNormalized: { type: String, default: '' },
    contactName: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    status: {
      type: String,
      required: true,
      enum: SUPPLIER_STATUSES,
      default: 'active',
    },
    openingBalance: {
      type: {
        kind: { type: String, enum: ['payable', 'advance'], required: true },
        amountMinorUnits: { type: String, required: true },
        currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
        postedAt: { type: Date, required: true },
        postedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
        ledgerEffectId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'LedgerEffect',
        },
        status: { type: String, required: true, enum: ['posted'], default: 'posted' },
      },
      default: undefined,
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'suppliers' },
);

supplierSchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });
supplierSchema.index({ organizationId: 1, phoneNormalized: 1 });
supplierSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const SupplierModel = mongoose.models['Supplier'] || mongoose.model('Supplier', supplierSchema);

module.exports = {
  SUPPLIER_STATUSES,
  SupplierModel,
};
