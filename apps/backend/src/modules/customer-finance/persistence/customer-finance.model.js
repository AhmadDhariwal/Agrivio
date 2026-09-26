const mongoose = require('mongoose');

const money = { type: String, required: true };

const customerLoanSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Customer' },
    principalMinorUnits: money,
    currency: { type: String, required: true, enum: ['PKR'], default: 'PKR' },
    disbursementAccountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
    businessDate: { type: String, required: true },
    dueDate: { type: String, default: null },
    reference: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, required: true, enum: ['posted', 'reversed'], default: 'posted' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'User' },
    reversalReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'customer_loans' },
);
customerLoanSchema.index({ organizationId: 1, customerId: 1, businessDate: -1, _id: -1 });
customerLoanSchema.index({ organizationId: 1, status: 1, businessDate: -1 });
customerLoanSchema.index({ organizationId: 1, dueDate: 1, status: 1 });

const customerLoanRepaymentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    loanId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CustomerLoan' },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Customer' },
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
  { timestamps: true, collection: 'customer_loan_repayments' },
);
customerLoanRepaymentSchema.index({ organizationId: 1, loanId: 1, createdAt: -1 });

const targetEffectSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      required: true,
      enum: ['customer_opening_receivable', 'sale', 'customer_manual_receivable'],
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    signedAmountMinorUnits: money,
  },
  { _id: false },
);

const customerBalanceAdjustmentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Organization' },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Customer' },
    balanceType: {
      type: String,
      required: true,
      enum: ['trade_receivable', 'customer_advance', 'loan_receivable'],
    },
    loanId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'CustomerLoan' },
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
    reversalOfId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'CustomerBalanceAdjustment' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true, collection: 'customer_balance_adjustments' },
);
customerBalanceAdjustmentSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
customerBalanceAdjustmentSchema.index({ organizationId: 1, businessDate: -1, _id: -1 });
customerBalanceAdjustmentSchema.index(
  { organizationId: 1, reversalOfId: 1 },
  { unique: true, partialFilterExpression: { reversalOfId: { $type: 'objectId' } } },
);

const CustomerLoanModel =
  mongoose.models.CustomerLoan || mongoose.model('CustomerLoan', customerLoanSchema);
const CustomerLoanRepaymentModel =
  mongoose.models.CustomerLoanRepayment ||
  mongoose.model('CustomerLoanRepayment', customerLoanRepaymentSchema);
const CustomerBalanceAdjustmentModel =
  mongoose.models.CustomerBalanceAdjustment ||
  mongoose.model('CustomerBalanceAdjustment', customerBalanceAdjustmentSchema);

module.exports = { CustomerLoanModel, CustomerLoanRepaymentModel, CustomerBalanceAdjustmentModel };
