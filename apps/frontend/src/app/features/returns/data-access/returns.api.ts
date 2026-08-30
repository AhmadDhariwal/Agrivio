import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  SalesReturnPostInput,
  SalesReturnRecord,
  WithoutInvoiceCreateInput,
} from '../models/returns.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateReturnMutationEffects,
  ReturnMutationInvalidationContext,
} from './returns-cache.invalidation';

@Injectable({ providedIn: 'root' })
export class ReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}/api/v1/returns`;

  private invalidateAfterMutation(record: ReturnMutationInvalidationContext): void {
    invalidateReturnMutationEffects(this.queryCache, record);
  }

  listReturns(
    params: PaginationQuery & {
      status?: string;
      returnType?: string;
      warehouseId?: string;
      saleId?: string;
      forceRefresh?: boolean;
    } = {},
  ): Observable<PaginatedResult<SalesReturnRecord>> {
    const queryParams: Record<string, string> = {
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 25),
    };
    if (params.status) {
      queryParams['status'] = params.status;
    }
    if (params.returnType) {
      queryParams['returnType'] = params.returnType;
    }
    if (params.warehouseId) {
      queryParams['warehouseId'] = params.warehouseId;
    }
    if (params.saleId) {
      queryParams['saleId'] = params.saleId;
    }
    const cacheKey = this.queryCache.buildKey('returns', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.returns],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: SalesReturnRecord[]; meta: PaginatedResult<SalesReturnRecord>['meta'] }>(
            this.baseUrl,
            { withCredentials: true, params: queryParams },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  getReturn(id: string, options?: { forceRefresh?: boolean }): Observable<SalesReturnRecord> {
    const cacheKey = this.queryCache.buildKey('return-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.returns],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: SalesReturnRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
          .pipe(map((response) => response.data)),
    });
  }

  createWithoutInvoice(payload: WithoutInvoiceCreateInput): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(`${this.baseUrl}/without-invoice`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  postReturn(
    returnId: string,
    payload: SalesReturnPostInput,
    idempotencyKey: string,
  ): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(`${this.baseUrl}/${returnId}/post`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap((record) =>
              this.invalidateAfterMutation({
                returnType: record.returnType,
                resolution: record.resolution,
                saleId: record.saleId,
                purchaseId: record.purchaseId,
              }),
            ),
          ),
      ),
    );
  }

  reverseReturn(
    returnId: string,
    payload: { reason: string; expectedVersion: number },
    idempotencyKey: string,
  ): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(`${this.baseUrl}/${returnId}/reverse`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(
            map((response) => response.data),
            tap((record) =>
              this.invalidateAfterMutation({
                returnType: record.returnType,
                resolution: record.resolution,
                saleId: record.saleId,
                purchaseId: record.purchaseId,
              }),
            ),
          ),
      ),
    );
  }
}
