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
  categoryName: string | null;
  accountName: string | null;
  amount: MoneyAmount;
  purpose: string;
  expenseDate: string;
  reference: string | null;
  status: ExpenseStatus;
  postedAt: string | null;
  postedBy: string | null;
  postedByName?: string | null;
  accountMovementId: string | null;
  accountMovementName?: string | null;
  correctionOfId: string | null;
  correctedByExpenseId: string | null;
  correctedByExpenseName?: string | null;
  correctedAt: string | null;
  correctedBy: string | null;
  correctedByName?: string | null;
  reason: string | null;
  version: number;
}
