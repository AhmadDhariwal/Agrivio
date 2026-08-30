import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateSupplierPaymentPostedEffects } from '../../purchases/data-access/purchases-cache.invalidation';
import { SupplierRecord } from '../../suppliers/models/suppliers.models';
import {
  SupplierLedgerEffectRecord,
  SupplierPaymentCreateInput,
  SupplierPaymentRecord,
  SupplierReconciliationRecord,
  UnpaidPurchaseRecord,
} from '../models/supplier-payments.models';

type SupplierPaymentsListQuery = PaginationQuery & {
  supplierId?: string;
  paymentDate?: string;
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SupplierPaymentsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly paymentsUrl = `${environment.publicApiBaseUrl}/api/v1/supplier-payments`;
  private readonly suppliersUrl = `${environment.publicApiBaseUrl}/api/v1/suppliers`;

  listSupplierPayments(
    params: SupplierPaymentsListQuery = {},
  ): Observable<PaginatedResult<SupplierPaymentRecord>> {
    const queryParams: Record<string, string | number> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    };
    if (params.search) queryParams['search'] = params.search;
    if (params.paymentDate) queryParams['paymentDate'] = params.paymentDate;
    if (params.supplierId) queryParams['supplierId'] = params.supplierId;

    const cacheKey = this.queryCache.buildKey('supplier-payments', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.supplierPayments],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<SupplierPaymentRecord[], PaginationMeta>>(this.paymentsUrl, {
            withCredentials: true,
            params: queryParams,
          })
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  postSupplierPayment(
    payload: SupplierPaymentCreateInput,
    idempotencyKey: string,
  ): Observable<SupplierPaymentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierPaymentRecord }>(this.paymentsUrl, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateSupplierPaymentPostedEffects(this.queryCache)),
          ),
      ),
    );
  }

  listSupplierLedgerSuppliers(
    search = '',
    options?: { forceRefresh?: boolean },
  ): Observable<SupplierRecord[]> {
    const params = search.trim() ? { search: search.trim() } : {};
    const cacheKey = this.queryCache.buildKey('supplier-ledger-suppliers', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.supplierOptions],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: SupplierRecord[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/supplier-ledger/suppliers`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  listSupplierLedger(
    supplierId: string,
    options?: { forceRefresh?: boolean },
  ): Observable<SupplierLedgerEffectRecord[]> {
    const cacheKey = this.queryCache.buildKey('supplier-ledger', { supplierId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.supplierLedger],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: SupplierLedgerEffectRecord[] } }>(
            `${this.suppliersUrl}/${supplierId}/ledger`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  listUnpaidPurchases(
    supplierId: string,
    options?: { forceRefresh?: boolean },
  ): Observable<UnpaidPurchaseRecord[]> {
    const cacheKey = this.queryCache.buildKey('supplier-unpaid-purchases', { supplierId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.payables, QUERY_CACHE_TAGS.purchases],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: UnpaidPurchaseRecord[] } }>(
            `${this.suppliersUrl}/${supplierId}/unpaid-purchases`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  reconcileSupplier(
    supplierId: string,
    options?: { forceRefresh?: boolean },
  ): Observable<SupplierReconciliationRecord> {
    const cacheKey = this.queryCache.buildKey('supplier-reconciliation', { supplierId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.supplierLedger, QUERY_CACHE_TAGS.payables],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: SupplierReconciliationRecord }>(
            `${this.suppliersUrl}/${supplierId}/reconciliation`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data)),
    });
  }
}
