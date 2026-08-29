import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ReturnsApi } from './returns.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateReturnMutationEffects } from './returns-cache.invalidation';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('ReturnsApi', () => {
  let api: ReturnsApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReturnsApi,
        QueryCacheService,
        { provide: HttpClient, useValue: { get: httpGet, post: httpPost } },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(ReturnsApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical list requests through QueryCacheService', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'ret-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listReturns({ page: 1, pageSize: 25, returnType: 'sales' }).subscribe();
    api.listReturns({ page: 1, pageSize: 25, returnType: 'sales' }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('tags returns list reads for invalidation', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');
    httpGet.mockReturnValue(
      of({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    api.listReturns({ page: 1, pageSize: 25 }).subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'dedupe-only',
        tags: [QUERY_CACHE_TAGS.returns],
      }),
    );
  });

  it('invalidates cross-module tags after successful post', () => {
    httpPost.mockReturnValue(
      of({
        data: {
          id: 'ret-1',
          returnType: 'sales',
          resolution: 'ledger_adjustment',
          saleId: 'sale-1',
          purchaseId: null,
        },
      }),
    );

    api
      .postReturn('ret-1', { reason: 'Damaged', expectedVersion: 1, resolution: 'ledger_adjustment' }, 'key-1')
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
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
      QUERY_CACHE_TAGS.sales,
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerOptions,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
    );
  });

  it('does not invalidate cache when post fails', () => {
    httpPost.mockReturnValue(throwError(() => new Error('post failed')));

    api
      .postReturn('ret-1', { reason: 'Damaged', expectedVersion: 1, resolution: 'ledger_adjustment' }, 'key-1')
      .subscribe({ error: () => undefined });

    expect(invalidateTags).not.toHaveBeenCalled();
  });
});

describe('invalidateReturnMutationEffects', () => {
  it('includes purchase and account tags for purchase return with account refund', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;

    invalidateReturnMutationEffects(queryCache, {
      returnType: 'purchase',
      resolution: 'account_refund',
      purchaseId: 'purchase-1',
    });

    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
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
      QUERY_CACHE_TAGS.purchases,
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.accounts,
      QUERY_CACHE_TAGS.accountOptions,
      QUERY_CACHE_TAGS.accountsSummary,
      QUERY_CACHE_TAGS.accountMovements,
      QUERY_CACHE_TAGS.expenses,
    );
  });
});
