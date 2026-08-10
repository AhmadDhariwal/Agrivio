import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AccountRecord } from '../models/accounts.models';

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listAccounts(): Observable<AccountRecord[]> {
    return this.http
      .get<{ data: { items: AccountRecord[] } }>(`${environment.publicApiBaseUrl}/api/v1/accounts`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
  }

  getAccount(id: string): Observable<AccountRecord> {
    return this.http
      .get<{ data: AccountRecord }>(`${environment.publicApiBaseUrl}/api/v1/accounts/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createAccount(payload: {
    name: string;
    accountType: string;
    bankName?: string;
    accountNumberMasked?: string;
    walletIdentifier?: string;
  }): Observable<AccountRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountRecord }>(`${environment.publicApiBaseUrl}/api/v1/accounts`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  updateAccount(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      bankName?: string;
      accountNumberMasked?: string;
      walletIdentifier?: string;
      status?: string;
    },
  ): Observable<AccountRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: AccountRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts/${id}`,
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

  postOpeningBalance(
    id: string,
    payload: { amount: { amount: string; currency: string } },
    idempotencyKey: string,
  ): Observable<AccountRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts/${id}/opening-balance`,
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
