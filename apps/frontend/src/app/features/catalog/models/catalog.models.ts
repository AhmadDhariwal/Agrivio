export type ProductClass = 'general' | 'fertilizer' | 'seed' | 'pesticide' | 'chemical';
export type TrackingMode = 'none' | 'batch' | 'batch_expiry';
export type MeasurementDimension = 'mass' | 'volume';
export type PriceTier = 'retail' | 'wholesale' | 'dealer' | 'distributor';
export type EntityStatus = 'active' | 'inactive' | string;

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface CategoryRecord {
  id: string;
  organizationId: string;
  name: string;
  productClass: ProductClass | string;
  status: EntityStatus;
  version: number;
}

export interface ProductRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  sku: string;
  trackingMode: TrackingMode | string;
  baseUnitCode: string;
  measurementDimension: MeasurementDimension | string;
  status: EntityStatus;
  version: number;
}

export interface PackagingUnitRecord {
  id: string;
  organizationId: string;
  productId: string;
  name: string;
  conversionFactor: string;
  status: EntityStatus;
  version: number;
}

export interface ProductPriceRecord {
  id: string;
  organizationId: string;
  productId: string;
  priceTier: PriceTier | string;
  price: MoneyAmount;
  status: EntityStatus;
  version: number;
}

export interface PackagingUnitsReplaceResult {
  productId: string;
  productVersion: number;
  items: PackagingUnitRecord[];
}

export interface ProductPricesReplaceResult {
  productId: string;
  productVersion: number;
  items: ProductPriceRecord[];
}
