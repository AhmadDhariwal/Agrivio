const mongoose = require('mongoose');

const EXPENSE_CATEGORY_STATUSES = ['active', 'inactive'];

const expenseCategorySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameNormalized: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: EXPENSE_CATEGORY_STATUSES,
      default: 'active',
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: 'expense_categories' },
);

expenseCategorySchema.index({ organizationId: 1, nameNormalized: 1 }, { unique: true });
expenseCategorySchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const ExpenseCategoryModel =
  mongoose.models['ExpenseCategory'] || mongoose.model('ExpenseCategory', expenseCategorySchema);

module.exports = {
  EXPENSE_CATEGORY_STATUSES,
  ExpenseCategoryModel,
};
