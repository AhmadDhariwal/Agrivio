export type EntityStatus = 'active' | 'inactive' | string;

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface SupplierOpeningBalance {
  kind: 'payable' | 'advance' | string;
  amount: MoneyAmount;
  postedAt: string;
  postedBy: string;
  ledgerEffectId: string;
  status: 'posted' | string;
}

export interface SupplierRecord {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  contactName: string;
  email: string;
  status: EntityStatus;
  version: number;
  openingBalance?: SupplierOpeningBalance;
  derivedBalances?: { payable: MoneyAmount; advance: MoneyAmount; netPayable?: MoneyAmount };
  softWarning?: {
    softWarning?: boolean;
    reason?: string;
    limit?: number;
    currentUsage?: number;
    remaining?: number;
  };
}

export interface SupplierRefundRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  accountId: string;
  amount: MoneyAmount;
  businessDate: string;
  reference: string | null;
  notes: string | null;
  status: 'posted' | 'reversed' | string;
  postedBy: string;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
}

export type SupplierBalanceType = 'supplier_payable' | 'supplier_advance';

export interface SupplierBalanceAdjustmentRecord {
  id: string;
  supplierId: string;
  balanceType: SupplierBalanceType;
  expectedCurrentBalance: MoneyAmount;
  desiredBalance: MoneyAmount;
  delta: MoneyAmount;
  signedDeltaMinorUnits: string;
  reason: string;
  category: string;
  businessDate: string;
  reference: string | null;
  notes: string | null;
  status: 'posted' | 'reversed' | string;
  reversalOfId: string | null;
}

export interface CreateSupplierRefundInput {
  supplierId: string;
  accountId: string;
  amount: MoneyAmount;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
}

export interface ReverseSupplierRefundInput {
  reason: string;
}

export interface AdjustSupplierBalanceInput {
  supplierId: string;
  balanceType: SupplierBalanceType;
  expectedCurrentBalance: MoneyAmount;
  desiredBalance: MoneyAmount;
  reason: string;
  category: string;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
}

export interface ReverseSupplierAdjustmentInput {
  reason: string;
}

export interface SupplierRefundListQuery {
  supplierId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
  forceRefresh?: boolean;
}
