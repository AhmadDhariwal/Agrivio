import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import {
  API_SUPPLIER_REFUNDS_PATH,
  API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH,
  ApiSuccessEnvelope,
  PaginationMeta,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  AdjustSupplierBalanceInput,
  CreateSupplierRefundInput,
  ReverseSupplierAdjustmentInput,
  ReverseSupplierRefundInput,
  SupplierBalanceAdjustmentRecord,
  SupplierRefundListQuery,
  SupplierRefundRecord,
} from '../models/suppliers.models';
import { PaginatedResult } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';

@Injectable({ providedIn: 'root' })
export class SupplierFinanceApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  private invalidateRefundReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierOptions,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.supplierRefunds,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
    invalidateAccountFinancialReads(this.queryCache);
  }

  private invalidateAdjustmentReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierOptions,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.supplierPayments,
      QUERY_CACHE_TAGS.reconciliation,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
  }

  listRefunds(
    query: SupplierRefundListQuery = {},
  ): Observable<PaginatedResult<SupplierRefundRecord>> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.supplierId) params['supplierId'] = query.supplierId;
    if (query.status && query.status !== 'all') params['status'] = query.status;
    if (query.fromDate) params['fromDate'] = query.fromDate;
    if (query.toDate) params['toDate'] = query.toDate;

    const cacheKey = this.queryCache.buildKey('supplier-refunds', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.supplierRefunds],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<SupplierRefundRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}${API_SUPPLIER_REFUNDS_PATH}`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  postRefund(
    payload: CreateSupplierRefundInput,
    idempotencyKey: string,
  ): Observable<SupplierRefundRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<ApiSuccessEnvelope<SupplierRefundRecord>>(
            `${environment.publicApiBaseUrl}${API_SUPPLIER_REFUNDS_PATH}`,
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
            tap(() => this.invalidateRefundReads()),
          ),
      ),
    );
  }

  reverseRefund(
    id: string,
    payload: ReverseSupplierRefundInput,
    idempotencyKey: string,
  ): Observable<SupplierRefundRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<ApiSuccessEnvelope<SupplierRefundRecord>>(
            `${environment.publicApiBaseUrl}${API_SUPPLIER_REFUNDS_PATH}/${id}/reverse`,
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
            tap(() => this.invalidateRefundReads()),
          ),
      ),
    );
  }

  adjustBalance(
    payload: AdjustSupplierBalanceInput,
    idempotencyKey: string,
  ): Observable<SupplierBalanceAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<ApiSuccessEnvelope<SupplierBalanceAdjustmentRecord>>(
            `${environment.publicApiBaseUrl}${API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH}`,
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
            tap(() => this.invalidateAdjustmentReads()),
          ),
      ),
    );
  }

  reverseAdjustment(
    id: string,
    payload: ReverseSupplierAdjustmentInput,
    idempotencyKey: string,
  ): Observable<SupplierBalanceAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<ApiSuccessEnvelope<SupplierBalanceAdjustmentRecord>>(
            `${environment.publicApiBaseUrl}${API_SUPPLIER_BALANCE_ADJUSTMENTS_PATH}/${id}/reverse`,
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
            tap(() => this.invalidateAdjustmentReads()),
          ),
      ),
    );
  }
}
