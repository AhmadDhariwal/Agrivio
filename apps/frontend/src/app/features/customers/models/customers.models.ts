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
  advance: MoneyAmount;
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
