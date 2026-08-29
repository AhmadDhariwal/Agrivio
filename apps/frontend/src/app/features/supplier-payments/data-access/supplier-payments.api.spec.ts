import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { SupplierPaymentsApi } from './supplier-payments.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateSupplierPaymentPostedEffects } from '../../purchases/data-access/purchases-cache.invalidation';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('SupplierPaymentsApi', () => {
  let api: SupplierPaymentsApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        SupplierPaymentsApi,
        QueryCacheService,
        { provide: HttpClient, useValue: { get: httpGet, post: httpPost } },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(SupplierPaymentsApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical listSupplierPayments requests', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'pay-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listSupplierPayments({ page: 1, pageSize: 25 }).subscribe();
    api.listSupplierPayments({ page: 1, pageSize: 25 }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('dedupes identical supplier ledger requests', () => {
    httpGet.mockReturnValue(of({ data: { items: [{ id: 'ledger-1' }] } }));

    api.listSupplierLedger('sup-1').subscribe();
    api.listSupplierLedger('sup-1').subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('dedupes identical unpaid purchase requests per supplier', () => {
    httpGet.mockReturnValue(of({ data: { items: [{ id: 'pur-1' }] } }));

    api.listUnpaidPurchases('sup-1').subscribe();
    api.listUnpaidPurchases('sup-1').subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('invalidates payables, ledger, purchases, and accounts after successful post', () => {
    httpPost.mockReturnValue(of({ data: { id: 'pay-1', allocations: [] } }));

    api
      .postSupplierPayment(
        {
          supplierId: 'sup-1',
          accountId: 'acc-1',
          amount: { amount: '100.00', currency: 'PKR' },
          paymentDate: '2026-08-29',
          allocationMode: 'general',
        },
        'key-1',
      )
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.supplierPayments,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.purchases,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
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

    api
      .postSupplierPayment(
        {
          supplierId: 'sup-1',
          accountId: 'acc-1',
          amount: { amount: '100.00', currency: 'PKR' },
          paymentDate: '2026-08-29',
          allocationMode: 'general',
        },
        'key-1',
      )
      .subscribe({ error: () => undefined });

    expect(invalidateTags).not.toHaveBeenCalled();
  });
});

describe('invalidateSupplierPaymentPostedEffects', () => {
  it('includes payables and purchases without accountOptions', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateSupplierPaymentPostedEffects(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.supplierPayments,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.purchases,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
    expect(queryCache.invalidateTags).not.toHaveBeenCalledWith(QUERY_CACHE_TAGS.accountOptions);
  });
});
