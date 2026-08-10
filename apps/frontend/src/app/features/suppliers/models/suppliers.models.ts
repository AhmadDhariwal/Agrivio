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
  derivedBalances?: { payable: MoneyAmount; advance: MoneyAmount };
  softWarning?: {
    softWarning?: boolean;
    reason?: string;
    limit?: number;
    currentUsage?: number;
    remaining?: number;
  };
}
