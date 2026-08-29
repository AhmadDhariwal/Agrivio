import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { PurchasesApi } from './purchases.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidatePurchaseDraftReads,
  invalidatePurchaseMutationEffects,
} from './purchases-cache.invalidation';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('PurchasesApi', () => {
  let api: PurchasesApi;
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
        PurchasesApi,
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

    api = TestBed.inject(PurchasesApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical listPurchases requests through QueryCacheService', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'pur-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listPurchases({ page: 1, pageSize: 25 }).subscribe();
    api.listPurchases({ page: 1, pageSize: 25 }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('tags purchases list reads for invalidation', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');
    httpGet.mockReturnValue(
      of({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    api.listPurchases({ page: 1, pageSize: 25 }).subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.purchases],
      }),
    );
  });

  it('invalidates only purchases reads after draft create', () => {
    httpPost.mockReturnValue(of({ data: { id: 'pur-1', version: 1 } }));

    api
      .createPurchase({
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        purchaseDate: '2026-08-29',
        lines: [],
      })
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.purchases);
    expect(invalidateTags).not.toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.stockBalances,
      QUERY_CACHE_TAGS.supplierLedger,
    );
  });

  it('invalidates cross-module tags after successful post without accountOptions', () => {
    httpPost.mockReturnValue(of({ data: { id: 'pur-1', version: 2, status: 'posted' } }));

    api
      .postPurchase('pur-1', { expectedVersion: 1, payments: [] }, 'key-1')
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
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
    );
    expect(invalidateTags).not.toHaveBeenCalledWith(QUERY_CACHE_TAGS.accountOptions);
  });

  it('invalidates account financial reads when post includes payments', () => {
    httpPost.mockReturnValue(of({ data: { id: 'pur-1', version: 2, status: 'posted' } }));

    api
      .postPurchase(
        'pur-1',
        {
          expectedVersion: 1,
          payments: [{ accountId: 'acc-1', amount: { amount: '100.00', currency: 'PKR' } }],
        },
        'key-1',
      )
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.accounts,
      QUERY_CACHE_TAGS.accountsSummary,
      QUERY_CACHE_TAGS.accountMovements,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
  });

  it('does not invalidate cache when post fails', () => {
    httpPost.mockReturnValue(throwError(() => new Error('post failed')));

    api.postPurchase('pur-1', { expectedVersion: 1, payments: [] }, 'key-1').subscribe({
      error: () => undefined,
    });

    expect(invalidateTags).not.toHaveBeenCalled();
  });
});

describe('invalidatePurchaseMutationEffects', () => {
  it('invalidates only purchases for draft mutations', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidatePurchaseMutationEffects(queryCache, 'draft');
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.purchases);
  });

  it('invalidates inventory and payables for posted mutations', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidatePurchaseMutationEffects(queryCache, 'post', { affectsAccounts: false });
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
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
    );
  });
});

describe('invalidatePurchaseDraftReads', () => {
  it('targets purchases tag only', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidatePurchaseDraftReads(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.purchases);
  });
});
