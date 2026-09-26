export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
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
  customer: CustomerSummary | null;
  accountId: string;
  allocationMode: 'general' | 'invoice_specific' | string;
  appliedTo: 'receivable' | 'advance' | 'receivable_and_advance' | null;
  amount: MoneyAmount;
  paymentDate: string;
  notes: string;
  status: string;
  postedAt: string;
  postedBy: string;
  correctionOfId?: string | null;
  reason?: string;
  replacementPaymentId?: string | null;
  allocations: PaymentAllocationRecord[];
}

export interface PaymentCorrectionReplacement {
  accountId?: string;
  amount?: MoneyAmount;
  paymentDate?: string;
  allocationMode?: 'general' | 'invoice_specific';
  allocations?: SaleAllocationInput[];
  notes?: string;
}

export interface PaymentCorrectionInput {
  reason: string;
  replacement?: PaymentCorrectionReplacement | null;
}

export interface PaymentCorrectionResult {
  original: CustomerPaymentRecord;
  reversal: CustomerPaymentRecord;
  replacement: CustomerPaymentRecord | null;
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

export interface UnpaidSaleRecord {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  sequence: string | null;
  outstanding: MoneyAmount;
  outstandingMinorUnits: string;
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
