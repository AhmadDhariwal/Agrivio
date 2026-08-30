import { invalidateInventoryDashboardEffects } from '../../dashboard/data-access/dashboard-cache.invalidation';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS, QueryCacheTag } from '../../../shared/data-access/query-cache.tags';

const ACCOUNT_OPENING_IMPORT_TYPES = new Set([
  'cash_opening_balances',
  'bank_opening_balances',
  'jazzcash_opening_balances',
  'easypaisa_opening_balances',
]);

export function importExecuteInvalidationTags(importType: string): QueryCacheTag[] {
  switch (importType) {
    case 'product_categories':
      return [QUERY_CACHE_TAGS.categories, QUERY_CACHE_TAGS.categoryOptions];
    case 'products':
      return [QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions];
    case 'product_prices':
      return [QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions];
    case 'customers':
      return [QUERY_CACHE_TAGS.customers, QUERY_CACHE_TAGS.customerOptions];
    case 'suppliers':
      return [QUERY_CACHE_TAGS.suppliers, QUERY_CACHE_TAGS.supplierOptions];
    case 'customer_opening_receivables':
    case 'customer_opening_advances':
      return [
        QUERY_CACHE_TAGS.customers,
        QUERY_CACHE_TAGS.customerLedger,
        QUERY_CACHE_TAGS.receivables,
        QUERY_CACHE_TAGS.dashboard,
        QUERY_CACHE_TAGS.reports,
        QUERY_CACHE_TAGS.alerts,
      ];
    case 'supplier_opening_payables':
    case 'supplier_opening_advances':
      return [
        QUERY_CACHE_TAGS.suppliers,
        QUERY_CACHE_TAGS.supplierLedger,
        QUERY_CACHE_TAGS.payables,
        QUERY_CACHE_TAGS.dashboard,
        QUERY_CACHE_TAGS.reports,
        QUERY_CACHE_TAGS.alerts,
      ];
    case 'opening_stock':
      return [
        QUERY_CACHE_TAGS.inventory,
        QUERY_CACHE_TAGS.batches,
        QUERY_CACHE_TAGS.expiry,
        QUERY_CACHE_TAGS.reconciliation,
        QUERY_CACHE_TAGS.stockMovements,
        QUERY_CACHE_TAGS.stockBalances,
        QUERY_CACHE_TAGS.stockAdjustments,
        QUERY_CACHE_TAGS.stockTransfers,
        QUERY_CACHE_TAGS.products,
        QUERY_CACHE_TAGS.dashboard,
        QUERY_CACHE_TAGS.reports,
        QUERY_CACHE_TAGS.alerts,
      ];
    default:
      if (ACCOUNT_OPENING_IMPORT_TYPES.has(importType)) {
        return [
          QUERY_CACHE_TAGS.accounts,
          QUERY_CACHE_TAGS.accountsSummary,
          QUERY_CACHE_TAGS.accountMovements,
          QUERY_CACHE_TAGS.dashboard,
          QUERY_CACHE_TAGS.reports,
        ];
      }
      return [];
  }
}

export function invalidateImportExecuteEffects(
  queryCache: QueryCacheService,
  importType: string,
): void {
  if (importType === 'opening_stock') {
    queryCache.invalidateTags(QUERY_CACHE_TAGS.importJobs, QUERY_CACHE_TAGS.importErrors);
    invalidateInventoryDashboardEffects(queryCache);
    return;
  }

  if (ACCOUNT_OPENING_IMPORT_TYPES.has(importType)) {
    queryCache.invalidateTags(QUERY_CACHE_TAGS.importJobs, QUERY_CACHE_TAGS.importErrors);
    invalidateAccountFinancialReads(queryCache);
    return;
  }

  const domainTags = importExecuteInvalidationTags(importType);
  queryCache.invalidateTags(
    QUERY_CACHE_TAGS.importJobs,
    QUERY_CACHE_TAGS.importErrors,
    ...domainTags,
  );
}
