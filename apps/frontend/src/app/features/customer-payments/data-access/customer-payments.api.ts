import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { API_CUSTOMER_PAYMENTS_PATH, API_CUSTOMERS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  CustomerLedgerEffectRecord,
  CustomerPaymentCreateInput,
  CustomerPaymentRecord,
} from '../models/customer-payments.models';

@Injectable({ providedIn: 'root' })
export class CustomerPaymentsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly paymentsUrl = `${environment.publicApiBaseUrl}${API_CUSTOMER_PAYMENTS_PATH}`;
  private readonly customersUrl = `${environment.publicApiBaseUrl}${API_CUSTOMERS_PATH}`;

  listCustomerPayments(params?: { customerId?: string }): Observable<CustomerPaymentRecord[]> {
    return this.http
      .get<{ data: { items: CustomerPaymentRecord[] } }>(this.paymentsUrl, {
        withCredentials: true,
        params: params ?? {},
      })
      .pipe(map((response) => response.data.items));
  }

  postCustomerPayment(
    payload: CustomerPaymentCreateInput,
    idempotencyKey: string,
  ): Observable<CustomerPaymentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerPaymentRecord }>(this.paymentsUrl, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  listCustomerLedger(customerId: string): Observable<CustomerLedgerEffectRecord[]> {
    return this.http
      .get<{ data: { items: CustomerLedgerEffectRecord[] } }>(
        `${this.customersUrl}/${customerId}/ledger`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }
}
