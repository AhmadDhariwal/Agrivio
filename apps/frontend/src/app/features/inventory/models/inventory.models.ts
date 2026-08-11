export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface ProductBatchRecord {
  id: string;
  organizationId: string;
  productId: string;
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string | null;
  firstReceivedAt: string;
}

export interface InventoryBalanceRecord {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  quantityBase: string;
  version: number;
  valuation?: {
    inventoryValue: MoneyAmount;
    weightedAverageCost: MoneyAmount;
    warehouseProductQuantityBase: string;
  };
}

export interface StockMovementRecord {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  direction: 'inbound' | 'outbound';
  quantityBase: string;
  enteredQuantity: string;
  unitCode: string;
  conversionFactorSnapshot: string;
  packagingUnitId: string | null;
  inventoryValue: MoneyAmount | null;
  unitCost: MoneyAmount | null;
  sourceType: string;
  sourceId: string;
  status: string;
  postedAt: string;
  postedBy: string;
}

export interface OpeningStockResult {
  movement: StockMovementRecord;
  batch: ProductBatchRecord | null;
  balance: InventoryBalanceRecord;
  costState: {
    organizationId: string;
    warehouseId: string;
    productId: string;
    quantityBase: string;
    inventoryValue: MoneyAmount;
    weightedAverageCost: MoneyAmount;
    lastWeightedAverageCost: MoneyAmount;
    currentInventoryValue: MoneyAmount;
    version: number;
  };
}
