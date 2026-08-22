import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import {
  PurchaseCancelInput,
  PurchaseDraftInput,
  PurchaseDraftUpdateInput,
  PurchasePostInput,
  PurchaseRecord,
} from '../models/purchases.models';

@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listPurchases(params: PaginationQuery & {
    supplierId?: string;
    warehouseId?: string;
  } = {}): Observable<PaginatedResult<PurchaseRecord>> {
    return this.http
      .get<ApiSuccessEnvelope<PurchaseRecord[], PaginationMeta>>(
        `${environment.publicApiBaseUrl}/api/v1/purchases`,
        { withCredentials: true, params: { ...params, page: params.page ?? 1, pageSize: params.pageSize ?? 25 } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta! })));
  }

  getPurchase(id: string): Observable<PurchaseRecord> {
    return this.http
      .get<{ data: PurchaseRecord }>(`${environment.publicApiBaseUrl}/api/v1/purchases/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createPurchase(payload: PurchaseDraftInput): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/purchases`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  updatePurchase(id: string, payload: PurchaseDraftUpdateInput): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: PurchaseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/purchases/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  discardPurchase(id: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.delete(`${environment.publicApiBaseUrl}/api/v1/purchases/${id}`, {
          withCredentials: true,
          headers: { 'X-CSRF-Token': csrfToken },
        }),
      ),
    );
  }

  postPurchase(
    id: string,
    payload: PurchasePostInput,
    idempotencyKey: string,
  ): Observable<PurchaseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/purchases/${id}/post`,
            payload,
            {
              withCredentials: true,
              headers: {
                'X-CSRF-Token': csrfToken,
                'Idempotency-Key': idempotencyKey,
              },
            },
          )
          .pipe(map((response) => response.data)),
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
          .post<{ data: PurchaseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/purchases/${id}/cancel`,
            payload,
            {
              withCredentials: true,
              headers: {
                'X-CSRF-Token': csrfToken,
                'Idempotency-Key': idempotencyKey,
              },
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
