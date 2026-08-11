export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface PurchaseLandedCosts {
  freight: MoneyAmount;
  loading: MoneyAmount;
  transport: MoneyAmount;
  other: MoneyAmount;
}

export interface PurchaseLineRecord {
  productId: string;
  productNameSnapshot: string;
  trackingModeSnapshot: string;
  packagingUnitId: string | null;
  unitCodeSnapshot: string;
  conversionFactorSnapshot: string;
  quantity: string;
  quantityBase: string;
  unitCost: MoneyAmount;
  lineProductAmount: MoneyAmount;
  batchNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
}

export interface PurchaseRecord {
  id: string;
  organizationId: string;
  branchId: string | null;
  warehouseId: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierInvoiceReference: string;
  purchaseDate: string;
  notes: string;
  status: 'draft' | 'posted' | string;
  lines: PurchaseLineRecord[];
  landedCosts: PurchaseLandedCosts;
  version: number;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  postedAt: string | null;
}

export interface PurchaseLineInput {
  productId: string;
  packagingUnitId?: string;
  quantity: string;
  unitCost: MoneyAmount;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
}

export interface PurchaseDraftInput {
  warehouseId: string;
  supplierId: string;
  branchId?: string;
  purchaseDate: string;
  supplierInvoiceReference?: string;
  notes?: string;
  lines: PurchaseLineInput[];
  landedCosts?: {
    freight?: MoneyAmount;
    loading?: MoneyAmount;
    transport?: MoneyAmount;
    other?: MoneyAmount;
  };
}

export interface PurchaseDraftUpdateInput extends PurchaseDraftInput {
  expectedVersion: number;
}
