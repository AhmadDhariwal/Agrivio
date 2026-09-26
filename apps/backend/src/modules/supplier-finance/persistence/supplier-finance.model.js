const mongoose = require('mongoose');

const money = { type: String, required: true };

const supplierRefundSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Supplier' },
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
    amountMinorUnits: money,
    currency: { type: String, required: true, enum: ['PKR'], default: 'PKR' },
    businessDate: { type: String, required: true },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, required: true, enum: ['posted', 'reversed'], default: 'posted' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'User' },
    reversalReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'supplier_refunds' },
);
supplierRefundSchema.index({ organizationId: 1, supplierId: 1, businessDate: -1, _id: -1 });
supplierRefundSchema.index({ organizationId: 1, accountId: 1, status: 1, businessDate: -1, _id: -1 });

const targetEffectSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      required: true,
      enum: ['supplier_opening_payable', 'purchase', 'supplier_manual_payable'],
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    signedAmountMinorUnits: money,
  },
  { _id: false },
);

const supplierBalanceAdjustmentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Supplier' },
    balanceType: { type: String, required: true, enum: ['supplier_payable', 'supplier_advance'] },
    expectedCurrentMinorUnits: money,
    desiredMinorUnits: money,
    deltaMinorUnits: money,
    currency: { type: String, required: true, enum: ['PKR'], default: 'PKR' },
    reason: { type: String, required: true },
    category: { type: String, required: true },
    businessDate: { type: String, required: true },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    targetEffects: { type: [targetEffectSchema], default: [] },
    status: { type: String, required: true, enum: ['posted'], default: 'posted' },
    reversalOfId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'SupplierBalanceAdjustment' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true, collection: 'supplier_balance_adjustments' },
);
supplierBalanceAdjustmentSchema.index({ organizationId: 1, supplierId: 1, createdAt: -1 });
supplierBalanceAdjustmentSchema.index({ organizationId: 1, businessDate: -1, _id: -1 });
supplierBalanceAdjustmentSchema.index(
  { organizationId: 1, reversalOfId: 1 },
  { unique: true, partialFilterExpression: { reversalOfId: { $type: 'objectId' } } },
);

const SupplierRefundModel =
  mongoose.models.SupplierRefund || mongoose.model('SupplierRefund', supplierRefundSchema);
const SupplierBalanceAdjustmentModel =
  mongoose.models.SupplierBalanceAdjustment ||
  mongoose.model('SupplierBalanceAdjustment', supplierBalanceAdjustmentSchema);

module.exports = { SupplierRefundModel, SupplierBalanceAdjustmentModel };
