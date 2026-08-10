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
