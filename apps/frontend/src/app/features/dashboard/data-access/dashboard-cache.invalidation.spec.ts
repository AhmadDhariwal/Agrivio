import { describe, expect, it, vi } from 'vitest';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateDashboardReads,
  invalidateInventoryDashboardEffects,
} from './dashboard-cache.invalidation';

describe('dashboard-cache.invalidation', () => {
  it('invalidates only the dashboard tag family', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateDashboardReads(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.dashboard);
  });

  it('invalidates dashboard alongside inventory posted-effect families', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateInventoryDashboardEffects(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
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
  });
});
