import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { API_CUSTOMER_PAYMENTS_PATH, API_CUSTOMERS_PATH, ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateCustomerPaymentPostedEffects } from '../../sales/data-access/sales-cache.invalidation';
import {
  CustomerLedgerEffectRecord,
  CustomerPaymentCreateInput,
  CustomerPaymentRecord,
  UnpaidSaleRecord,
} from '../models/customer-payments.models';

type CustomerPaymentsListQuery = PaginationQuery & {
  customerId?: string | undefined;
  paymentDate?: string | undefined;
  search?: string | undefined;
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class CustomerPaymentsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly paymentsUrl = `${environment.publicApiBaseUrl}${API_CUSTOMER_PAYMENTS_PATH}`;
  private readonly customersUrl = `${environment.publicApiBaseUrl}${API_CUSTOMERS_PATH}`;

  listCustomerPayments(
    params: CustomerPaymentsListQuery = {},
  ): Observable<PaginatedResult<CustomerPaymentRecord>> {
    const queryParams: Record<string, string | number> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    };
    if (params.search) queryParams['search'] = params.search;
    if (params.paymentDate) queryParams['paymentDate'] = params.paymentDate;
    if (params.customerId) queryParams['customerId'] = params.customerId;

    const cacheKey = this.queryCache.buildKey('customer-payments', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customerPayments],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CustomerPaymentRecord[], PaginationMeta>>(this.paymentsUrl, {
            withCredentials: true,
            params: queryParams,
          })
          .pipe(
            map((response) => ({
              items: response.data,
              meta: response.meta ?? {
                page: Number(params.page ?? 1),
                pageSize: Number(params.pageSize ?? 25),
                total: response.data.length,
              },
            })),
          ),
    });
  }

  postCustomerPayment(
    payload: CustomerPaymentCreateInput,
    idempotencyKey: string,
  ): Observable<CustomerPaymentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerPaymentRecord }>(this.paymentsUrl, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateCustomerPaymentPostedEffects(this.queryCache)),
          ),
      ),
    );
  }

  listCustomerLedger(
    customerId: string,
    options?: { forceRefresh?: boolean },
  ): Observable<CustomerLedgerEffectRecord[]> {
    const cacheKey = this.queryCache.buildKey('customer-ledger', { customerId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.customerLedger],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: CustomerLedgerEffectRecord[] } }>(
            `${this.customersUrl}/${customerId}/ledger`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  listUnpaidSales(customerId: string, options?: { forceRefresh?: boolean }): Observable<UnpaidSaleRecord[]> {
    const cacheKey = this.queryCache.buildKey('customer-unpaid-sales', { customerId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.receivables, QUERY_CACHE_TAGS.sales],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: UnpaidSaleRecord[] } }>(
            `${this.customersUrl}/${customerId}/unpaid-sales`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }
}
