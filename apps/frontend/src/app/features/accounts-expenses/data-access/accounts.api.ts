import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  AccountMovementRecord,
  AccountRecord,
  AccountsSummary,
  AccountTransactionRecord,
  AccountTransferRecord,
} from '../models/accounts.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateAccountFinancialReads,
  invalidateAccountMasterReads,
} from '../../../shared/data-access/finance-cache.invalidation';

type AccountListQuery = PaginationQuery & {
  status?: string;
  search?: string;
  forceRefresh?: boolean;
};

type AccountMovementQuery = PaginationQuery & {
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  getSummary(options?: { forceRefresh?: boolean }): Observable<AccountsSummary> {
    const cacheKey = this.queryCache.buildKey('accounts-summary', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.accountsSummary],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: AccountsSummary }>(`${environment.publicApiBaseUrl}/api/v1/accounts/summary`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  listAccounts(params: AccountListQuery = {}): Observable<PaginatedResult<AccountRecord>> {
    const queryParams = this.paginationParams(params);
    if (params.status) {
      queryParams['status'] = params.status;
    }
    if (params.search) {
      queryParams['search'] = params.search;
    }
    const cacheKey = this.queryCache.buildKey('accounts', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.accounts],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: AccountRecord[]; meta: PaginatedResult<AccountRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts`,
            { withCredentials: true, params: queryParams },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  searchAccountOptions(search = ''): Observable<AccountRecord[]> {
    const params = this.paginationParams({ page: 1, pageSize: 25, search, status: 'active' });
    const cacheKey = this.queryCache.buildKey('account-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.accountOptions],
      loader: () =>
        this.http
          .get<{ data: AccountRecord[]; meta: PaginatedResult<AccountRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data)),
    });
  }

  listAccountOptions(): Observable<AccountRecord[]> {
    return this.searchAccountOptions('');
  }

  getAccount(id: string, options?: { forceRefresh?: boolean }): Observable<AccountRecord> {
    const cacheKey = this.queryCache.buildKey('account-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.accounts],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: AccountRecord }>(`${environment.publicApiBaseUrl}/api/v1/accounts/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  listMovements(
    accountId: string,
    params: AccountMovementQuery = {},
  ): Observable<PaginatedResult<AccountMovementRecord>> {
    const queryParams = this.paginationParams(params);
    const cacheKey = this.queryCache.buildKey('account-movements', { accountId, ...queryParams });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.accountMovements],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: AccountMovementRecord[]; meta: PaginatedResult<AccountMovementRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/accounts/${accountId}/movements`,
            { withCredentials: true, params: queryParams },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountMasterReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountMasterReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountMasterReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
      ),
    );
  }

  private paginationParams(query: PaginationQuery): Record<string, string> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.search) {
      params['search'] = query.search;
    }
    if (query.status && query.status !== 'all') {
      params['status'] = query.status;
    }
    return params;
  }
}
