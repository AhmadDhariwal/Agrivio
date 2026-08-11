import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
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

  listSupplierPayments(params?: { supplierId?: string }): Observable<SupplierPaymentRecord[]> {
    return this.http
      .get<{ data: { items: SupplierPaymentRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/supplier-payments`,
        { withCredentials: true, params: params ?? {} },
      )
      .pipe(map((response) => response.data.items));
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
