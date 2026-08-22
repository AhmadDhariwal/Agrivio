import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AccountMovementRecord, AccountRecord, AccountTransactionRecord, AccountTransferRecord } from '../models/accounts.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listAccounts(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<AccountRecord>> {
    return this.http
      .get<{ data: AccountRecord[]; meta: PaginatedResult<AccountRecord>['meta'] }>(`${environment.publicApiBaseUrl}/api/v1/accounts`, {
        withCredentials: true,
        params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) },
      })
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  listAccountOptions(): Observable<AccountRecord[]> {
    return this.listAccounts({ page: 1, pageSize: 100, status: 'active' }).pipe(map((result) => result.items));
  }

  getAccount(id: string): Observable<AccountRecord> {
    return this.http
      .get<{ data: AccountRecord }>(`${environment.publicApiBaseUrl}/api/v1/accounts/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  listMovements(accountId: string, params: PaginationQuery = {}): Observable<PaginatedResult<AccountMovementRecord>> {
    return this.http
      .get<{ data: AccountMovementRecord[]; meta: PaginatedResult<AccountMovementRecord>['meta'] }>(
        `${environment.publicApiBaseUrl}/api/v1/accounts/${accountId}/movements`,
        { withCredentials: true, params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25 } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
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

  deleteAccount(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
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

  postManualTransaction(
    payload: {
      accountId: string;
      direction: 'inflow' | 'outflow';
      amount: { amount: string; currency: string };
      purpose: string;
      reference?: string;
    },
    idempotencyKey: string,
  ): Observable<AccountTransactionRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountTransactionRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/account-transactions`,
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

  reverseManualTransaction(
    id: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<AccountTransactionRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountTransactionRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/account-transactions/${id}/reverse`,
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

  postTransfer(
    payload: {
      sourceAccountId: string;
      destinationAccountId: string;
      amount: { amount: string; currency: string };
      purpose?: string;
      reference?: string;
    },
    idempotencyKey: string,
  ): Observable<AccountTransferRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountTransferRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/account-transfers`,
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

  reverseTransfer(
    id: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<AccountTransferRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: AccountTransferRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/account-transfers/${id}/reverse`,
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
