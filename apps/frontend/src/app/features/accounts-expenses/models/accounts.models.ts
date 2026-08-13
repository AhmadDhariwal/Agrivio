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
  purpose?: string | null;
  reference?: string | null;
  reversalOfId?: string | null;
  status: string;
  postedAt: string;
  postedBy: string;
}

export interface AccountTransactionRecord {
  id: string;
  organizationId: string;
  accountId: string;
  direction: 'inflow' | 'outflow' | string;
  amount: MoneyAmount;
  signedAmount: MoneyAmount;
  purpose: string | null;
  reference: string | null;
  sourceType: string;
  sourceId: string;
  reversalOfId: string | null;
  reversedByMovementId: string | null;
  status: string;
  postedAt: string;
  postedBy: string;
}

export interface AccountTransferRecord {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: MoneyAmount;
  purpose: string | null;
  reference: string | null;
  outboundMovementId: string;
  inboundMovementId: string;
  reversalOutboundMovementId: string | null;
  reversalInboundMovementId: string | null;
  status: string;
  postedAt: string;
  postedBy: string;
  reason?: string | null;
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
