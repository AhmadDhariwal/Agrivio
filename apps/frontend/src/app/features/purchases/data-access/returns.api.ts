import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  PurchaseReturnCreateInput,
  PurchaseReturnRecord,
} from '../models/purchases.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { invalidateReturnMutationEffects } from '../../returns/data-access/returns-cache.invalidation';

export interface ReturnPostInput {
  reason: string;
  expectedVersion: number;
  resolution: 'ledger_adjustment';
}

@Injectable({ providedIn: 'root' })
export class ReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  createReturn(
    purchaseId: string,
    payload: PurchaseReturnCreateInput,
  ): Observable<PurchaseReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseReturnRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/purchases/${purchaseId}/returns`,
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

  postReturn(
    returnId: string,
    payload: ReturnPostInput,
    idempotencyKey: string,
  ): Observable<PurchaseReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseReturnRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/returns/${returnId}/post`,
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
            tap((record) =>
              invalidateReturnMutationEffects(this.queryCache, {
                returnType: 'purchase',
                resolution: payload.resolution,
                saleId: null,
                purchaseId: record.purchaseId ?? null,
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
  ): Observable<PurchaseReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: PurchaseReturnRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/returns/${returnId}/reverse`,
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
            tap((record) =>
              invalidateReturnMutationEffects(this.queryCache, {
                returnType: 'purchase',
                resolution: 'ledger_adjustment',
                saleId: null,
                purchaseId: record.purchaseId ?? null,
              }),
            ),
          ),
      ),
    );
  }
}
