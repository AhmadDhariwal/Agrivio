import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { API_SALES_PATH, ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateSaleDraftReads,
  invalidateSaleMutationEffects,
} from './sales-cache.invalidation';
import {
  SaleDraftInput,
  SaleDraftUpdateInput,
  SalePostInput,
  SaleCancelInput,
  SaleRecord,
  SalePrintInvoice,
  PosPaymentAccount,
} from '../models/sales.models';

type SalesListQuery = PaginationQuery & {
  customerId?: string;
  warehouseId?: string;
  branchId?: string;
  status?: string;
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_SALES_PATH}`;

  listSales(params: SalesListQuery = {}): Observable<PaginatedResult<SaleRecord>> {
    const queryParams: Record<string, string | number> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    };
    if (params.search) queryParams['search'] = params.search;
    if (params.status) queryParams['status'] = params.status;
    if (params.customerId) queryParams['customerId'] = params.customerId;
    if (params.warehouseId) queryParams['warehouseId'] = params.warehouseId;
    if (params.branchId) queryParams['branchId'] = params.branchId;

    const cacheKey = this.queryCache.buildKey('sales', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.sales],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<SaleRecord[], PaginationMeta>>(this.baseUrl, {
            withCredentials: true,
            params: queryParams,
          })
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  getSale(id: string, options?: { forceRefresh?: boolean }): Observable<SaleRecord> {
    const cacheKey = this.queryCache.buildKey('sale-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.sales],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: SaleRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
          .pipe(map((response) => response.data)),
    });
  }

  getPrintInvoice(id: string, options?: { forceRefresh?: boolean }): Observable<SalePrintInvoice> {
    const cacheKey = this.queryCache.buildKey('sale-print', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.sales],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: SalePrintInvoice }>(`${this.baseUrl}/${id}/print`, { withCredentials: true })
          .pipe(map((response) => response.data)),
    });
  }

  listPosPaymentAccounts(): Observable<PosPaymentAccount[]> {
    const cacheKey = this.queryCache.buildKey('pos-payment-accounts', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.accountOptions],
      loader: () =>
        this.http
          .get<{ data: { items: PosPaymentAccount[] } }>(`${this.baseUrl}/payment-accounts`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data.items)),
    });
  }

  createSale(payload: SaleDraftInput): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(this.baseUrl, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateSaleDraftReads(this.queryCache)),
          ),
      ),
    );
  }

  updateSale(id: string, payload: SaleDraftUpdateInput): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: SaleRecord }>(`${this.baseUrl}/${id}`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateSaleDraftReads(this.queryCache)),
          ),
      ),
    );
  }

  discardSale(id: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete(`${this.baseUrl}/${id}`, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(tap(() => invalidateSaleDraftReads(this.queryCache))),
      ),
    );
  }

  postSale(id: string, payload: SalePostInput, idempotencyKey: string): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(`${this.baseUrl}/${id}/post`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateSaleMutationEffects(this.queryCache, 'post')),
          ),
      ),
    );
  }

  cancelSale(id: string, payload: SaleCancelInput, idempotencyKey: string): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(`${this.baseUrl}/${id}/cancel`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateSaleMutationEffects(this.queryCache, 'cancel')),
          ),
      ),
    );
  }
}
