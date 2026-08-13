export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface PaymentAllocationRecord {
  id: string;
  targetType: string;
  targetId: string;
  allocatedAmount: MoneyAmount;
  status: string;
}

export interface CustomerPaymentRecord {
  id: string;
  organizationId: string;
  partyType: string;
  supplierId: string | null;
  customerId: string | null;
  accountId: string;
  allocationMode: 'general' | 'invoice_specific' | string;
  amount: MoneyAmount;
  paymentDate: string;
  notes: string;
  status: string;
  postedAt: string;
  postedBy: string;
  allocations: PaymentAllocationRecord[];
}

export interface CustomerLedgerEffectRecord {
  id: string;
  organizationId: string;
  partyType: string;
  customerId: string | null;
  supplierId: string | null;
  effectKind: string;
  signedAmount: MoneyAmount;
  currency: string;
  sourceType: string;
  sourceId: string;
  status: string;
  postedAt: string;
  postedBy: string;
}

export interface SaleAllocationInput {
  saleId: string;
  amount: MoneyAmount;
}

export interface CustomerPaymentCreateInput {
  customerId: string;
  accountId: string;
  amount: MoneyAmount;
  paymentDate: string;
  allocationMode: 'general' | 'invoice_specific';
  notes?: string;
  allocations?: SaleAllocationInput[];
}
