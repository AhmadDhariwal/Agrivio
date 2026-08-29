import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidatePurchaseDraftReads,
  invalidatePurchaseMutationEffects,
} from './purchases-cache.invalidation';
import {
  PurchaseCancelInput,
  PurchaseDraftInput,
  PurchaseDraftUpdateInput,
  PurchasePostInput,
  PurchaseRecord,
} from '../models/purchases.models';

type PurchasesListQuery = PaginationQuery & {
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}/api/v1/purchases`;

  listPurchases(
    params: PurchasesListQuery = {},
  ): Observable<PaginatedResult<PurchaseRecord>> {
    const queryParams: Record<string, string | number> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    };
    if (params.search) queryParams['search'] = params.search;
    if (params.status) queryParams['status'] = params.status;
    if (params.supplierId) queryParams['supplierId'] = params.supplierId;
    if (params.warehouseId) queryParams['warehouseId'] = params.warehouseId;

    const cacheKey = this.queryCache.buildKey('purchases', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.purchases],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<PurchaseRecord[], PaginationMeta>>(this.baseUrl, {
            withCredentials: true,
            params: queryParams,
          })
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  getPurchase(id: string, options?: { forceRefresh?: boolean }): Observable<PurchaseRecord> {
    const cacheKey = this.queryCache.buildKey('purchase-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.purchases],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: PurchaseRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
          .pipe(map((response) => response.data)),
    });
  }

  createPurchase(payload: PurchaseDraftInput): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseRecord }>(this.baseUrl, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidatePurchaseDraftReads(this.queryCache)),
          ),
      ),
    );
  }

  updatePurchase(id: string, payload: PurchaseDraftUpdateInput): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: PurchaseRecord }>(`${this.baseUrl}/${id}`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidatePurchaseDraftReads(this.queryCache)),
          ),
      ),
    );
  }

  discardPurchase(id: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete(`${this.baseUrl}/${id}`, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(tap(() => invalidatePurchaseDraftReads(this.queryCache))),
      ),
    );
  }

  postPurchase(
    id: string,
    payload: PurchasePostInput,
    idempotencyKey: string,
  ): Observable<PurchaseRecord> {
    const affectsAccounts = (payload.payments?.length ?? 0) > 0;
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseRecord }>(`${this.baseUrl}/${id}/post`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap(() =>
              invalidatePurchaseMutationEffects(this.queryCache, 'post', { affectsAccounts }),
            ),
          ),
      ),
    );
  }

  cancelPurchase(
    id: string,
    payload: PurchaseCancelInput,
    idempotencyKey: string,
  ): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseRecord }>(`${this.baseUrl}/${id}/cancel`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap((record) =>
              invalidatePurchaseMutationEffects(this.queryCache, 'cancel', {
                affectsAccounts: (record.payments?.length ?? 0) > 0,
              }),
            ),
          ),
      ),
    );
  }
}
