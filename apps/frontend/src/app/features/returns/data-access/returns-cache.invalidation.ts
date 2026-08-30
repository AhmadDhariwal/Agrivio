import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS, QueryCacheTag } from '../../../shared/data-access/query-cache.tags';

export interface ReturnMutationInvalidationContext {
  returnType: string;
  resolution?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
}

function uniqueTags(tags: QueryCacheTag[]): QueryCacheTag[] {
  return [...new Set(tags)];
}

export function invalidateReturnMutationEffects(
  queryCache: QueryCacheService,
  context: ReturnMutationInvalidationContext,
): void {
  const tags: QueryCacheTag[] = [
    QUERY_CACHE_TAGS.returns,
    QUERY_CACHE_TAGS.inventory,
    QUERY_CACHE_TAGS.batches,
    QUERY_CACHE_TAGS.expiry,
    QUERY_CACHE_TAGS.stockMovements,
    QUERY_CACHE_TAGS.stockBalances,
    QUERY_CACHE_TAGS.products,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
    QUERY_CACHE_TAGS.alerts,
  ];

  const returnType = String(context.returnType ?? '');

  if (returnType === 'purchase' || context.purchaseId) {
    tags.push(
      QUERY_CACHE_TAGS.purchases,
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
    );
  }

  if (returnType === 'sales' || returnType === 'sales_without_invoice' || context.saleId) {
    tags.push(
      QUERY_CACHE_TAGS.sales,
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerOptions,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
    );
  }

  if (context.resolution === 'account_refund') {
    tags.push(
      QUERY_CACHE_TAGS.accounts,
      QUERY_CACHE_TAGS.accountsSummary,
      QUERY_CACHE_TAGS.accountMovements,
      QUERY_CACHE_TAGS.expenses,
    );
  }

  queryCache.invalidateTags(...uniqueTags(tags));
}
