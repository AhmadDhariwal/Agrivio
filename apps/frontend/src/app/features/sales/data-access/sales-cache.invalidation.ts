import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS, QueryCacheTag } from '../../../shared/data-access/query-cache.tags';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';

export type SaleMutationKind = 'draft' | 'post' | 'cancel';

function uniqueTags(tags: QueryCacheTag[]): QueryCacheTag[] {
  return [...new Set(tags)];
}

export function invalidateSaleDraftReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.sales);
}

export function invalidateSalePostedEffects(queryCache: QueryCacheService): void {
  const tags: QueryCacheTag[] = [
    QUERY_CACHE_TAGS.sales,
    QUERY_CACHE_TAGS.inventory,
    QUERY_CACHE_TAGS.batches,
    QUERY_CACHE_TAGS.expiry,
    QUERY_CACHE_TAGS.stockMovements,
    QUERY_CACHE_TAGS.stockBalances,
    QUERY_CACHE_TAGS.products,
    QUERY_CACHE_TAGS.customers,
    QUERY_CACHE_TAGS.customerLedger,
    QUERY_CACHE_TAGS.receivables,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
    QUERY_CACHE_TAGS.alerts,
  ];
  queryCache.invalidateTags(...uniqueTags(tags));
  invalidateAccountFinancialReads(queryCache);
}

export function invalidateSaleMutationEffects(
  queryCache: QueryCacheService,
  kind: SaleMutationKind,
): void {
  if (kind === 'draft') {
    invalidateSaleDraftReads(queryCache);
    return;
  }
  invalidateSalePostedEffects(queryCache);
}

export function invalidateCustomerPaymentPostedEffects(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(
    QUERY_CACHE_TAGS.customerPayments,
    QUERY_CACHE_TAGS.customers,
    QUERY_CACHE_TAGS.customerLedger,
    QUERY_CACHE_TAGS.receivables,
    QUERY_CACHE_TAGS.sales,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
  );
  invalidateAccountFinancialReads(queryCache);
}
