import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { invalidateReturnMutationEffects } from '../../returns/data-access/returns-cache.invalidation';

export interface SalesReturnPostInput {
  reason: string;
  expectedVersion: number;
  resolution: 'ledger_adjustment' | 'account_refund';
  refundAccountId?: string | null;
  lines?: Array<{
    originalLineIndex?: number;
    stockCondition: 'sellable' | 'unsellable';
    unsellableReason?: string | null;
  }>;
}

export interface SalesReturnRecord {
  id: string;
  version: number;
  status: string;
  returnType: string;
  saleId: string | null;
  resolution?: string;
  purchaseId?: string | null;
}

export interface SalesReturnCreateInput {
  lines: Array<{
    originalLineIndex: number;
    quantity: string;
    batchId?: string | null;
    stockCondition: 'sellable' | 'unsellable';
    unsellableReason?: string | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class SalesReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  createLinkedReturn(saleId: string, payload: SalesReturnCreateInput): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/sales/${saleId}/returns`,
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
    payload: SalesReturnPostInput,
    idempotencyKey: string,
  ): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(
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
                returnType: record.returnType ?? 'sales',
                resolution: record.resolution ?? payload.resolution,
                saleId: record.saleId,
                purchaseId: record.purchaseId ?? null,
              }),
            ),
          ),
      ),
    );
  }
}
