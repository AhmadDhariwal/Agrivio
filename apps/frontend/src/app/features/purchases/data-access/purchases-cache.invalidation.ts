import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS, QueryCacheTag } from '../../../shared/data-access/query-cache.tags';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';

export type PurchaseMutationKind = 'draft' | 'post' | 'cancel';

function uniqueTags(tags: QueryCacheTag[]): QueryCacheTag[] {
  return [...new Set(tags)];
}

export function invalidatePurchaseDraftReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.purchases);
}

export function invalidatePurchasePostedEffects(
  queryCache: QueryCacheService,
  options: { affectsAccounts?: boolean } = {},
): void {
  const tags: QueryCacheTag[] = [
    QUERY_CACHE_TAGS.purchases,
    QUERY_CACHE_TAGS.inventory,
    QUERY_CACHE_TAGS.batches,
    QUERY_CACHE_TAGS.expiry,
    QUERY_CACHE_TAGS.stockMovements,
    QUERY_CACHE_TAGS.stockBalances,
    QUERY_CACHE_TAGS.products,
    QUERY_CACHE_TAGS.supplierLedger,
    QUERY_CACHE_TAGS.payables,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
    QUERY_CACHE_TAGS.alerts,
  ];
  queryCache.invalidateTags(...uniqueTags(tags));
  if (options.affectsAccounts !== false) {
    invalidateAccountFinancialReads(queryCache);
  }
}

export function invalidatePurchaseMutationEffects(
  queryCache: QueryCacheService,
  kind: PurchaseMutationKind,
  options: { affectsAccounts?: boolean } = {},
): void {
  if (kind === 'draft') {
    invalidatePurchaseDraftReads(queryCache);
    return;
  }
  invalidatePurchasePostedEffects(queryCache, options);
}

export function invalidateSupplierPaymentPostedEffects(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(
    QUERY_CACHE_TAGS.supplierPayments,
    QUERY_CACHE_TAGS.supplierLedger,
    QUERY_CACHE_TAGS.payables,
    QUERY_CACHE_TAGS.purchases,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
  );
  invalidateAccountFinancialReads(queryCache);
}
