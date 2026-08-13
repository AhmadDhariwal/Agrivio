const mongoose = require('mongoose');

const EXPENSE_STATUSES = ['draft', 'posted', 'corrected'];

const expenseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ExpenseCategory',
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Account',
    },
    amountMinorUnits: { type: String, required: true },
    currency: { type: String, required: true, default: 'PKR', enum: ['PKR'] },
    purpose: { type: String, required: true },
    expenseDate: { type: String, required: true },
    reference: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: EXPENSE_STATUSES,
      default: 'draft',
    },
    postedAt: { type: Date, default: null },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    accountMovementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountMovement',
      default: null,
    },
    correctionOfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
    },
    correctedByExpenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
    },
    correctedAt: { type: Date, default: null },
    correctedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: { type: String, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'expenses' },
);

expenseSchema.index({ organizationId: 1, status: 1, postedAt: -1 });
expenseSchema.index({ organizationId: 1, createdAt: -1 });
expenseSchema.index({ organizationId: 1, correctionOfId: 1 });
expenseSchema.index(
  { organizationId: 1, correctionOfId: 1 },
  {
    unique: true,
    partialFilterExpression: { correctionOfId: { $type: 'objectId' } },
    name: 'expenses_correction_of_unique',
  },
);

const ExpenseModel = mongoose.models['Expense'] || mongoose.model('Expense', expenseSchema);

module.exports = {
  EXPENSE_STATUSES,
  ExpenseModel,
};
