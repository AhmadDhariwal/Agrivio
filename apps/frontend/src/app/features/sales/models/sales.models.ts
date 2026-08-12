export interface MoneyAmount {
  amount: string;
  currency: string;
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
  saleDate: string;
  notes: string;
  status: 'draft' | 'posted' | string;
  invoiceNumber: string | null;
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
