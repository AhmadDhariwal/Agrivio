import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { CustomerRecord } from '../models/customers.models';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  private invalidateCustomerReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerOptions,
    );
  }

  private invalidateCustomerFinancialReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerOptions,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    );
  }

  listCustomers(
    query: PaginationQuery & { forceRefresh?: boolean } = {},
  ): Observable<PaginatedResult<CustomerRecord>> {
    const params = this.paginationParams(query);
    const cacheKey = this.queryCache.buildKey('customers', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customers],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CustomerRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/customers`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  searchCustomerOptions(search = ''): Observable<CustomerRecord[]> {
    const params = this.paginationParams({ page: 1, pageSize: 25, search, status: 'active' });
    const cacheKey = this.queryCache.buildKey('customer-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customerOptions],
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CustomerRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/customers`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data)),
    });
  }

  private paginationParams(query: PaginationQuery): Record<string, string> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.search) params['search'] = query.search;
    if (query.status && query.status !== 'all') params['status'] = query.status;
    return params;
  }

  getCustomer(id: string): Observable<CustomerRecord> {
    const cacheKey = this.queryCache.buildKey('customer-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customers],
      loader: () =>
        this.http
          .get<{ data: CustomerRecord }>(`${environment.publicApiBaseUrl}/api/v1/customers/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  createCustomer(payload: {
    name: string;
    phone?: string;
    customerType: string;
    priceTier?: string;
    creditEnabled?: boolean;
    creditLimit?: { amount: string; currency: string };
    creditLimitBehaviour?: string;
  }): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateCustomerReads()),
          ),
      ),
    );
  }

  updateCustomer(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      phone?: string;
      customerType?: string;
      priceTier?: string;
      status?: string;
    },
  ): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateCustomerReads()),
          ),
      ),
    );
  }

  deleteCustomer(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateCustomerReads()),
          ),
      ),
    );
  }

  updateCreditPolicy(
    id: string,
    payload: {
      expectedVersion: number;
      creditEnabled?: boolean;
      creditLimit?: { amount: string; currency: string };
      creditLimitBehaviour?: string;
    },
  ): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}/credit-policy`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateCustomerReads()),
          ),
      ),
    );
  }

  postOpeningBalance(
    id: string,
    payload: { kind: string; amount: { amount: string; currency: string } },
    idempotencyKey: string,
  ): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}/opening-balance`,
            payload,
            {
              withCredentials: true,
              headers: {
                'X-CSRF-Token': csrfToken,
                'Idempotency-Key': idempotencyKey,
              },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateCustomerFinancialReads()),
          ),
      ),
    );
  }
}
