export type AccountType = 'cash' | 'bank' | 'jazzcash' | 'easypaisa';
export type EntityStatus = 'active' | 'inactive' | string;

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface AccountOpeningBalance {
  kind: 'balance' | string;
  amount: MoneyAmount;
  postedAt: string;
  postedBy: string;
  accountMovementId: string;
  status: 'posted' | string;
}

export interface AccountMovementRecord {
  id: string;
  organizationId: string;
  accountId: string;
  signedAmount: MoneyAmount;
  sourceType: string;
  sourceId: string;
  status: string;
  postedAt: string;
  postedBy: string;
}

export interface AccountRecord {
  id: string;
  organizationId: string;
  accountType: AccountType | string;
  name: string;
  bankName: string;
  accountNumberMasked: string;
  walletIdentifier: string;
  status: EntityStatus;
  version: number;
  openingBalance?: AccountOpeningBalance;
  derivedBalances?: { balance: MoneyAmount };
}
