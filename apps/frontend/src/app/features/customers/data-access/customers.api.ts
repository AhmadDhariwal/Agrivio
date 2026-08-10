import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { CustomerRecord } from '../models/customers.models';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listCustomers(): Observable<CustomerRecord[]> {
    return this.http
      .get<{ data: { items: CustomerRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/customers`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  getCustomer(id: string): Observable<CustomerRecord> {
    return this.http
      .get<{ data: CustomerRecord }>(`${environment.publicApiBaseUrl}/api/v1/customers/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createCustomer(payload: {
    name: string;
    phone?: string;
    customerType: string;
    priceTier?: string;
    creditEnabled?: boolean;
    creditLimit?: { amount: string; currency: string };
    creditLimitBehaviour?: string;
  }): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers`,
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

  updateCustomer(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      phone?: string;
      customerType?: string;
      priceTier?: string;
      status?: string;
    },
  ): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}`,
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

  updateCreditPolicy(
    id: string,
    payload: {
      expectedVersion: number;
      creditEnabled?: boolean;
      creditLimit?: { amount: string; currency: string };
      creditLimitBehaviour?: string;
    },
  ): Observable<CustomerRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: CustomerRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/customers/${id}/credit-policy`,
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
}
