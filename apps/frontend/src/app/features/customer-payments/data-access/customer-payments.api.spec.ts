import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { CustomerPaymentsApi } from './customer-payments.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthApi } from '../../auth/data-access/auth.api';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateCustomerPaymentPostedEffects } from '../../sales/data-access/sales-cache.invalidation';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('CustomerPaymentsApi', () => {
  let api: CustomerPaymentsApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        CustomerPaymentsApi,
        QueryCacheService,
        { provide: HttpClient, useValue: { get: httpGet, post: httpPost } },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(CustomerPaymentsApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical listCustomerPayments requests', () => {
    httpGet.mockReturnValue(
      of({ data: [{ id: 'pay-1' }], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    api.listCustomerPayments({ page: 1, pageSize: 25 }).subscribe();
    api.listCustomerPayments({ page: 1, pageSize: 25 }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('dedupes identical customer ledger requests', () => {
    httpGet.mockReturnValue(of({ data: { items: [{ id: 'ledger-1' }] } }));

    api.listCustomerLedger('cust-1').subscribe();
    api.listCustomerLedger('cust-1').subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('invalidates ledger, receivables, sales, and accounts after successful post', () => {
    httpPost.mockReturnValue(of({ data: { id: 'pay-1', allocations: [] } }));

    api
      .postCustomerPayment(
        {
          customerId: 'cust-1',
          accountId: 'acc-1',
          amount: { amount: '100.00', currency: 'PKR' },
          paymentDate: '2026-08-29',
          allocationMode: 'general',
        },
        'key-1',
      )
      .subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.customerPayments,
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.sales,
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

    api
      .postCustomerPayment(
        {
          customerId: 'cust-1',
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

describe('invalidateCustomerPaymentPostedEffects', () => {
  it('includes sales and receivables without accountOptions', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateCustomerPaymentPostedEffects(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.customerPayments,
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.sales,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    );
    expect(queryCache.invalidateTags).not.toHaveBeenCalledWith(QUERY_CACHE_TAGS.accountOptions);
  });
});
