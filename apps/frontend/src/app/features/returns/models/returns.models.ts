export interface MoneyAmount {
  amount: string;
  currency: string;
}

export type ReturnType = 'purchase' | 'sales' | 'sales_without_invoice' | string;
export type ReturnStatus = 'draft' | 'posted' | 'reversed' | string;
export type ReturnResolution = 'ledger_adjustment' | 'account_refund';
export type StockCondition = 'sellable' | 'unsellable';
export type UnsellableReason = 'expired' | 'damaged' | 'opened' | 'contaminated' | 'other';

export interface ReturnLineRecord {
  productId: string;
  productNameSnapshot: string;
  packagingUnitId: string | null;
  unitCodeSnapshot: string;
  conversionFactorSnapshot: string;
  quantity: string;
  quantityBase: string;
  batchId: string | null;
  batchNumber: string | null;
  originalLineIndex: number | null;
  stockCondition: StockCondition | null;
  unsellableReason: UnsellableReason | null;
  returnInventoryValue: MoneyAmount | null;
  returnRevenue: MoneyAmount | null;
}

export interface SalesReturnRecord {
  id: string;
  organizationId: string;
  returnType: ReturnType;
  purchaseId: string | null;
  saleId: string | null;
  supplierId: string | null;
  customerId: string | null;
  customerIdentifyingName: string | null;
  customerIdentifyingPhone: string | null;
  warehouseId: string;
  reason: string;
  resolution: ReturnResolution | string;
  refundAccountId: string | null;
  approvedReturnValue: MoneyAmount | null;
  withoutInvoiceApproval: {
    approvedBy: string;
    approvedAt: string;
    reason: string;
  } | null;
  status: ReturnStatus;
  lines: ReturnLineRecord[];
  returnTotal: MoneyAmount | null;
  currency: string;
  version: number;
  postedAt: string | null;
  postedBy: string | null;
  reversedByCorrectiveTransactionId: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
}

export interface SalesReturnPostInput {
  reason: string;
  expectedVersion: number;
  resolution: ReturnResolution;
  refundAccountId?: string | null;
  approvedReturnValue?: MoneyAmount;
  lines?: Array<{
    originalLineIndex?: number;
    stockCondition: StockCondition;
    unsellableReason?: UnsellableReason | null;
  }>;
}

export interface WithoutInvoiceCreateInput {
  warehouseId: string;
  customerId?: string | null;
  customerIdentifyingName?: string | null;
  customerIdentifyingPhone?: string | null;
  lines: Array<{
    productId: string;
    quantity: string;
    packagingUnitId?: string;
    batchId?: string | null;
    stockCondition: StockCondition;
    unsellableReason?: UnsellableReason | null;
  }>;
}
