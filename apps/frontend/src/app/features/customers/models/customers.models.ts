export type CustomerType = 'walk_in' | 'farmer' | 'individual' | 'business' | 'corporate';
export type PriceTier = 'retail' | 'wholesale' | 'dealer' | 'distributor';
export type CreditLimitBehaviour = 'warning' | 'manager_approval' | 'block';
export type EntityStatus = 'active' | 'inactive' | string;

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface CustomerOpeningBalance {
  kind: 'receivable' | 'advance' | string;
  amount: MoneyAmount;
  postedAt: string;
  postedBy: string;
  ledgerEffectId: string;
  status: 'posted' | string;
}

export interface CustomerDerivedBalances {
  receivable: MoneyAmount;
  loanReceivable?: MoneyAmount;
  advance: MoneyAmount;
  netExposure?: MoneyAmount;
  totalExposure?: MoneyAmount;
}

export type CustomerLoanStatus = 'open' | 'partially_repaid' | 'repaid' | 'reversed';

export interface CustomerLoanRecord {
  id: string;
  organizationId: string;
  customerId: string;
  customerName?: string;
  principal: MoneyAmount;
  outstanding: MoneyAmount;
  repaid: MoneyAmount;
  businessDate: string;
  dueDate?: string | null;
  disbursementAccountId: string;
  status: CustomerLoanStatus;
  reference?: string | null;
  notes?: string | null;
  createdBy?: string;
  totalRepaid?: MoneyAmount;
  outstandingBalance?: MoneyAmount;
  disbursementDate?: string;
}

export interface CustomerLoanRepaymentRecord {
  id: string;
  loanId?: string;
  customerId?: string;
  accountId: string;
  amount: MoneyAmount;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
  status: 'posted' | 'reversed' | string;
  postedBy?: string;
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalReason?: string | null;
}

export interface CustomerLoanDetailRecord extends CustomerLoanRecord {
  repayments: CustomerLoanRepaymentRecord[];
}

export type CustomerBalanceType = 'trade_receivable' | 'customer_advance' | 'loan_receivable';

export interface CustomerBalanceAdjustmentRecord {
  id: string;
  customerId: string;
  balanceType: CustomerBalanceType;
  loanId?: string | null;
  expectedCurrentBalance: MoneyAmount;
  desiredBalance: MoneyAmount;
  delta: MoneyAmount;
  signedDeltaMinorUnits?: string;
  reason: string;
  category: string;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
  status: 'posted' | string;
  reversalOfId?: string | null;
}

export interface CustomerRecord {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  customerType: CustomerType | string;
  priceTier: PriceTier | string;
  creditEnabled: boolean;
  creditLimit: MoneyAmount;
  creditLimitBehaviour: CreditLimitBehaviour | string;
  status: EntityStatus;
  version: number;
  openingBalance?: CustomerOpeningBalance;
  derivedBalances?: CustomerDerivedBalances;
  softWarning?: {
    softWarning?: boolean;
    reason?: string;
    limit?: number;
    currentUsage?: number;
    remaining?: number;
  };
}
