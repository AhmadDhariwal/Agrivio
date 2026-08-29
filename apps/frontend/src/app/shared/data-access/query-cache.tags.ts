export const QUERY_CACHE_TAGS = {
  products: 'products',
  productOptions: 'product-options',
  warehouses: 'warehouses',
  inventory: 'inventory',
  batches: 'batches',
  expiry: 'expiry',
  reconciliation: 'reconciliation',
  stockMovements: 'stock-movements',
  stockBalances: 'stock-balances',
} as const;

export type QueryCacheTag = (typeof QUERY_CACHE_TAGS)[keyof typeof QUERY_CACHE_TAGS];
