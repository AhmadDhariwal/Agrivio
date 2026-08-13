export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface SaleStockAllocationRecord {
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityBase: string;
  cogs: MoneyAmount;
}

export interface SaleLineRecord {
  productId: string;
  productNameSnapshot: string;
  packagingUnitId: string | null;
  unitCodeSnapshot: string;
  conversionFactorSnapshot: string;
  quantity: string;
  quantityBase: string;
  unitPrice: MoneyAmount;
  lineProductAmount: MoneyAmount;
  priceTierSnapshot?: string | null;
  catalogPrice?: MoneyAmount | null;
  priceOverrideReason?: string | null;
  cogsTotal?: MoneyAmount | null;
  stockAllocations?: SaleStockAllocationRecord[];
}

export interface SalePaymentSnapshot {
  accountId: string;
  accountNameSnapshot: string;
  accountTypeSnapshot: string;
  amount: MoneyAmount;
  paymentId: string | null;
}

export interface SaleRecord {
  id: string;
  organizationId: string;
  branchId: string;
  branchNameSnapshot?: string | null;
  warehouseId: string;
  warehouseNameSnapshot?: string | null;
  customerId: string | null;
  customerNameSnapshot?: string | null;
  priceTierSnapshot?: string | null;
  saleDate: string;
  notes: string;
  status: 'draft' | 'posted' | 'cancelled' | string;
  invoiceNumber: string | null;
  saleTotal?: MoneyAmount | null;
  paidTotal?: MoneyAmount | null;
  receivableTotal?: MoneyAmount | null;
  cogsTotal?: MoneyAmount | null;
  payments?: SalePaymentSnapshot[];
  lines: SaleLineRecord[];
  creditLimitApproval?: SaleApprovalRecord | null;
  expiredStockApproval?: SaleApprovalRecord | null;
  negativeStockOverride?: SaleApprovalRecord | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  version: number;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleApprovalRecord {
  reason: string;
  approvedBy: string;
  approvedAt: string | null;
}

export interface SaleLineInput {
  productId: string;
  packagingUnitId?: string;
  quantity: string;
  unitPrice: MoneyAmount;
}

export interface SaleDraftInput {
  branchId: string;
  warehouseId: string;
  customerId?: string | null;
  saleDate: string;
  notes?: string;
  lines: SaleLineInput[];
}

export interface SaleDraftUpdateInput extends SaleDraftInput {
  expectedVersion: number;
}

export interface SalePaymentInput {
  accountId: string;
  amount: MoneyAmount;
}

export interface SaleLinePriceOverrideInput {
  lineIndex: number;
  reason: string;
}

export interface SaleApprovalInput {
  reason: string;
}

export interface SalePostApprovalsInput {
  creditLimit?: SaleApprovalInput;
  expiredStock?: SaleApprovalInput;
  negativeStock?: SaleApprovalInput;
}

export interface SalePostInput {
  expectedVersion: number;
  payments: SalePaymentInput[];
  linePriceOverrides?: SaleLinePriceOverrideInput[];
  approvals?: SalePostApprovalsInput;
}

export interface SaleCancelInput {
  expectedVersion: number;
  reason: string;
}

export type InvoicePrintLayout = '58mm' | '80mm' | 'a4';

export const INVOICE_PRINT_LAYOUTS: InvoicePrintLayout[] = ['58mm', '80mm', 'a4'];

export interface PosPaymentAccount {
  id: string;
  name: string;
  accountType: string;
}

export interface SalePrintLine {
  productNameSnapshot: string;
  unitCodeSnapshot: string;
  conversionFactorSnapshot: string;
  quantity: string;
  unitPrice: MoneyAmount;
  lineProductAmount: MoneyAmount;
}

export interface SalePrintPayment {
  accountNameSnapshot: string;
  accountTypeSnapshot: string;
  amount: MoneyAmount;
}

export interface SalePrintInvoice {
  invoiceNumber: string | null;
  status: string;
  saleDate: string;
  postedAt: string | null;
  branchNameSnapshot: string | null;
  warehouseNameSnapshot: string | null;
  customerNameSnapshot: string | null;
  priceTierSnapshot: string | null;
  notes: string;
  saleTotal: MoneyAmount | null;
  paidTotal: MoneyAmount | null;
  receivableTotal: MoneyAmount | null;
  lines: SalePrintLine[];
  payments: SalePrintPayment[];
}
