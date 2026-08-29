import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { SupplierRecord } from '../models/suppliers.models';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  private invalidateSupplierReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierOptions,
    );
  }

  private invalidateSupplierFinancialReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierOptions,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    );
  }

  listSuppliers(
    query: PaginationQuery & { forceRefresh?: boolean } = {},
  ): Observable<PaginatedResult<SupplierRecord>> {
    const params = this.paginationParams(query);
    const cacheKey = this.queryCache.buildKey('suppliers', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.suppliers],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<SupplierRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  searchSupplierOptions(search = ''): Observable<SupplierRecord[]> {
    const params = this.paginationParams({ page: 1, pageSize: 25, search, status: 'active' });
    const cacheKey = this.queryCache.buildKey('supplier-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.supplierOptions],
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<SupplierRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers`,
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

  getSupplier(id: string): Observable<SupplierRecord> {
    const cacheKey = this.queryCache.buildKey('supplier-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.suppliers],
      loader: () =>
        this.http
          .get<{ data: SupplierRecord }>(`${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  createSupplier(payload: {
    name: string;
    phone?: string;
    contactName?: string;
    email?: string;
  }): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateSupplierReads()),
          ),
      ),
    );
  }

  updateSupplier(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      phone?: string;
      contactName?: string;
      email?: string;
      status?: string;
    },
  ): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateSupplierReads()),
          ),
      ),
    );
  }

  deleteSupplier(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateSupplierReads()),
          ),
      ),
    );
  }

  postOpeningBalance(
    id: string,
    payload: { kind: string; amount: { amount: string; currency: string } },
    idempotencyKey: string,
  ): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}/opening-balance`,
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
            tap(() => this.invalidateSupplierFinancialReads()),
          ),
      ),
    );
  }
}
