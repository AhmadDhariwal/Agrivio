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
  stockLocations?: BatchStockLocation[];
}

export interface BatchStockLocation {
  warehouseId: string;
  quantityBase: string;
  unsellableQuantityBase: string;
}

export interface InventoryBalanceRecord {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  quantityBase: string;
  unsellableQuantityBase?: string;
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
  stockCondition?: string;
  status: string;
  postedAt: string;
  postedBy: string;
  productNameSnapshot?: string | null;
  productSkuSnapshot?: string | null;
  productBaseUnitSnapshot?: string | null;
  warehouseNameSnapshot?: string | null;
  warehouseCodeSnapshot?: string | null;
  batchNumberSnapshot?: string | null;
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

export interface ExpiryInventoryRecord {
  warehouseId: string;
  productId: string;
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityBase: string;
  classification: 'expired' | 'upcoming' | 'normal';
  businessDate: string;
  thresholdDays: number;
}

export interface StockAdjustmentRecord {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  adjustmentType: 'damage' | 'expiry' | 'loss' | 'correction';
  direction: 'inbound' | 'outbound';
  quantityBase: string;
  enteredQuantity: string;
  unitCode: string;
  conversionFactorSnapshot: string;
  packagingUnitId: string | null;
  inventoryValue: MoneyAmount | null;
  reason: string | null;
  status: 'draft' | 'posted' | 'reversed';
  postedAt: string | null;
  postedBy: string | null;
  postedMovementId: string | null;
  reversalOfId: string | null;
  reversedByAdjustmentId: string | null;
  negativeStockOverride: boolean;
  version: number;
}

export interface WarehouseTransferRecord {
  id: string;
  organizationId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  productId: string;
  batchId: string | null;
  quantityBase: string;
  enteredQuantity: string;
  unitCode: string;
  conversionFactorSnapshot?: string;
  packagingUnitId?: string | null;
  transferValue: MoneyAmount | null;
  reason: string | null;
  status: 'draft' | 'posted' | 'reversed';
  postedAt?: string | null;
  postedBy?: string | null;
  outboundMovementId: string | null;
  inboundMovementId: string | null;
  reversalOfId: string | null;
  reversedByTransferId: string | null;
  negativeStockOverride?: boolean;
  version: number;
}

export interface ReconciliationResult {
  ok: boolean;
  findings: Array<{ code: string; [key: string]: unknown }>;
}
