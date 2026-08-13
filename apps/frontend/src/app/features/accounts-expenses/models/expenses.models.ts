import { MoneyAmount } from '../../accounts-expenses/models/accounts.models';

export type ExpenseStatus = 'draft' | 'posted' | 'corrected' | string;

export interface ExpenseCategoryRecord {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  version: number;
}

export interface ExpenseRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  accountId: string;
  amount: MoneyAmount;
  purpose: string;
  expenseDate: string;
  reference: string | null;
  status: ExpenseStatus;
  postedAt: string | null;
  postedBy: string | null;
  accountMovementId: string | null;
  correctionOfId: string | null;
  correctedByExpenseId: string | null;
  correctedAt: string | null;
  correctedBy: string | null;
  reason: string | null;
  version: number;
}
