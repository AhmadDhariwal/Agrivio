export type CustomerType = 'walk_in' | 'farmer' | 'individual' | 'business' | 'corporate';
export type PriceTier = 'retail' | 'wholesale' | 'dealer' | 'distributor';
export type CreditLimitBehaviour = 'warning' | 'manager_approval' | 'block';
export type EntityStatus = 'active' | 'inactive' | string;

export interface MoneyAmount {
  amount: string;
  currency: string;
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
}
