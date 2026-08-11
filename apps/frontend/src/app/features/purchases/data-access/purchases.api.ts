import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  PurchaseDraftInput,
  PurchaseDraftUpdateInput,
  PurchasePostInput,
  PurchaseRecord,
} from '../models/purchases.models';

@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listPurchases(params?: {
    status?: string;
    supplierId?: string;
    warehouseId?: string;
  }): Observable<PurchaseRecord[]> {
    return this.http
      .get<{ data: { items: PurchaseRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/purchases`,
        { withCredentials: true, params: params ?? {} },
      )
      .pipe(map((response) => response.data.items));
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
}
