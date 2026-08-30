import { QueryCacheService } from './query-cache.service';
import { QUERY_CACHE_TAGS } from './query-cache.tags';

export function invalidateAccountMasterReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.accounts, QUERY_CACHE_TAGS.accountOptions);
}

export function invalidateAccountFinancialReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(
    QUERY_CACHE_TAGS.accounts,
    QUERY_CACHE_TAGS.accountsSummary,
    QUERY_CACHE_TAGS.accountMovements,
    QUERY_CACHE_TAGS.dashboard,
    QUERY_CACHE_TAGS.reports,
  );
}

export function invalidateExpenseReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.expenses);
}

export function invalidateExpenseCategoryReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(
    QUERY_CACHE_TAGS.expenseCategories,
    QUERY_CACHE_TAGS.expenseCategoryOptions,
  );
}

export function invalidateExpenseFinancialReads(queryCache: QueryCacheService): void {
  invalidateExpenseReads(queryCache);
  invalidateAccountFinancialReads(queryCache);
}
