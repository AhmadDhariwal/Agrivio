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

export interface SupplierPaymentRecord {
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

export interface SupplierLedgerEffectRecord {
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

export interface UnpaidPurchaseRecord {
  id: string;
  purchaseDate: string;
  dueDate: string | null;
  sequence: string | null;
  outstanding: MoneyAmount;
  outstandingMinorUnits: string;
}

export interface SupplierReconciliationFinding {
  code: string;
  expectedMinorUnits?: string;
  actualMinorUnits?: string;
  allocationTotalMinorUnits?: string;
  allocationEffectTotalMinorUnits?: string;
}

export interface SupplierReconciliationRecord {
  supplierId: string;
  ok: boolean;
  payable: MoneyAmount;
  advance: MoneyAmount;
  allocationTotal: MoneyAmount;
  accountMovementTotal: MoneyAmount;
  findings: SupplierReconciliationFinding[];
}

export interface InvoiceAllocationInput {
  purchaseId: string;
  amount: MoneyAmount;
}

export interface SupplierPaymentCreateInput {
  supplierId: string;
  accountId: string;
  amount: MoneyAmount;
  paymentDate: string;
  allocationMode: 'general' | 'invoice_specific';
  notes?: string;
  allocations?: InvoiceAllocationInput[];
}
