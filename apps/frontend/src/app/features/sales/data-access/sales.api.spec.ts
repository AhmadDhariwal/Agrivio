import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { SalesApi } from './sales.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateSaleDraftReads,
  invalidateSaleMutationEffects,
} from './sales-cache.invalidation';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('SalesApi', () => {
  let api: SalesApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let httpPatch: ReturnType<typeof vi.fn>;
  let httpDelete: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    httpPatch = vi.fn();
    httpDelete = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        SalesApi,
        QueryCacheService,
        {
          provide: HttpClient,
          useValue: { get: httpGet, post: httpPost, patch: httpPatch, delete: httpDelete },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(SalesApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical listSales requests through QueryCacheService', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'sale-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listSales({ page: 1, pageSize: 25 }).subscribe();
    api.listSales({ page: 1, pageSize: 25 }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('tags sales list reads for invalidation', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');
    httpGet.mockReturnValue(
      of({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    api.listSales({ page: 1, pageSize: 25 }).subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.sales],
      }),
    );
  });

  it('invalidates only sales reads after draft create', () => {
    httpPost.mockReturnValue(of({ data: { id: 'sale-1', version: 1 } }));

    api.createSale({
      branchId: 'br-1',
      warehouseId: 'wh-1',
      saleDate: '2026-08-29',
      lines: [],
    }).subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.sales);
    expect(invalidateTags).not.toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.stockBalances,
      QUERY_CACHE_TAGS.accounts,
    );
  });

  it('invalidates cross-module tags after successful post', () => {
    httpPost.mockReturnValue(of({ data: { id: 'sale-1', version: 2, status: 'posted' } }));

    api.postSale('sale-1', { expectedVersion: 1, payments: [] }, 'key-1').subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
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
    );
    expect(invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.accounts,
      QUERY_CACHE_TAGS.accountsSummary,
      QUERY_CACHE_TAGS.accountMovements,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
    expect(invalidateTags).not.toHaveBeenCalledWith(QUERY_CACHE_TAGS.accountOptions);
  });

  it('does not invalidate cache when post fails', () => {
    httpPost.mockReturnValue(throwError(() => new Error('post failed')));

    api.postSale('sale-1', { expectedVersion: 1, payments: [] }, 'key-1').subscribe({
      error: () => undefined,
    });

    expect(invalidateTags).not.toHaveBeenCalled();
  });
});

describe('invalidateSaleMutationEffects', () => {
  it('invalidates only sales for draft mutations', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateSaleMutationEffects(queryCache, 'draft');
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.sales);
  });

  it('invalidates inventory and finance families for posted mutations', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateSaleMutationEffects(queryCache, 'post');
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
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
    );
  });
});

describe('invalidateSaleDraftReads', () => {
  it('only targets sales tag family', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateSaleDraftReads(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.sales);
  });
});
