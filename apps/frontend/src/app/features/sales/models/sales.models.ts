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
  status: 'draft' | 'posted' | string;
  invoiceNumber: string | null;
  saleTotal?: MoneyAmount | null;
  paidTotal?: MoneyAmount | null;
  receivableTotal?: MoneyAmount | null;
  cogsTotal?: MoneyAmount | null;
  payments?: SalePaymentSnapshot[];
  lines: SaleLineRecord[];
  version: number;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface SalePostInput {
  expectedVersion: number;
  payments: SalePaymentInput[];
  linePriceOverrides?: SaleLinePriceOverrideInput[];
}
