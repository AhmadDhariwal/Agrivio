import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

export function invalidateDashboardReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.dashboard);
}

export function invalidateInventoryDashboardEffects(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(
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
  );
}
