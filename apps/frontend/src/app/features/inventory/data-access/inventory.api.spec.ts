import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { InventoryApi } from './inventory.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('InventoryApi', () => {
  let api: InventoryApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        InventoryApi,
        QueryCacheService,
        {
          provide: HttpClient,
          useValue: { get: httpGet, post: httpPost },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(InventoryApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical listBalances requests through QueryCacheService', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'bal-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listBalances({ page: 1, pageSize: 25 }).subscribe();
    api.listBalances({ page: 1, pageSize: 25 }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('tags stock balances reads for invalidation', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');
    httpGet.mockReturnValue(
      of({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    api.listBalances({ page: 1, pageSize: 25 }).subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.stockBalances],
      }),
    );
  });

  it('invalidates inventory and related tags after successful postAdjustment', () => {
    httpPost.mockReturnValue(of({ data: { id: 'adj-1', status: 'posted' } }));

    api
      .postAdjustment('adj-1', { reason: 'Count variance' }, 'idemp-1')
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
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

  it('invalidates inventory tags after successful postTransfer', () => {
    httpPost.mockReturnValue(of({ data: { id: 'trf-1', status: 'posted' } }));

    api
      .postTransfer('trf-1', { reason: 'Branch replenishment' }, 'idemp-2')
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
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

  it('does not invalidate cache when mutation fails', () => {
    httpPost.mockReturnValue(throwError(() => new Error('Post failed')));

    api
      .postAdjustment('adj-1', { reason: 'Count variance' }, 'idemp-3')
      .subscribe({ error: () => undefined });

    expect(invalidateTags).not.toHaveBeenCalled();
  });
});
