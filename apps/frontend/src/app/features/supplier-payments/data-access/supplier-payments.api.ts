import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import {
  SupplierLedgerEffectRecord,
  SupplierPaymentCreateInput,
  SupplierPaymentRecord,
  SupplierReconciliationRecord,
  UnpaidPurchaseRecord,
} from '../models/supplier-payments.models';

@Injectable({ providedIn: 'root' })
export class SupplierPaymentsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listSupplierPayments(params: PaginationQuery & { supplierId?: string } = {}): Observable<PaginatedResult<SupplierPaymentRecord>> {
    return this.http
      .get<ApiSuccessEnvelope<SupplierPaymentRecord[], PaginationMeta>>(
        `${environment.publicApiBaseUrl}/api/v1/supplier-payments`,
        { withCredentials: true, params: { ...params, page: params.page ?? 1, pageSize: params.pageSize ?? 25 } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta! })));
  }

  postSupplierPayment(
    payload: SupplierPaymentCreateInput,
    idempotencyKey: string,
  ): Observable<SupplierPaymentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierPaymentRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/supplier-payments`,
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

  listSupplierLedger(supplierId: string): Observable<SupplierLedgerEffectRecord[]> {
    return this.http
      .get<{ data: { items: SupplierLedgerEffectRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/suppliers/${supplierId}/ledger`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  listUnpaidPurchases(supplierId: string): Observable<UnpaidPurchaseRecord[]> {
    return this.http
      .get<{ data: { items: UnpaidPurchaseRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/suppliers/${supplierId}/unpaid-purchases`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  reconcileSupplier(supplierId: string): Observable<SupplierReconciliationRecord> {
    return this.http
      .get<{ data: SupplierReconciliationRecord }>(
        `${environment.publicApiBaseUrl}/api/v1/suppliers/${supplierId}/reconciliation`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }
}
