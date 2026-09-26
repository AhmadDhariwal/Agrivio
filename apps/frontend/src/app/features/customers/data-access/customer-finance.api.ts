import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import {
  API_CUSTOMER_LOANS_PATH,
  API_CUSTOMER_LOAN_REPAYMENTS_PATH,
  API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH,
  ApiSuccessEnvelope,
  PaginationMeta,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  CustomerBalanceAdjustmentRecord,
  CustomerLoanDetailRecord,
  CustomerLoanRecord,
} from '../models/customers.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';

export type CustomerLoanListQuery = {
  page?: number | undefined;
  pageSize?: number | undefined;
  customerId?: string | undefined;
  status?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  search?: string | undefined;
  forceRefresh?: boolean | undefined;
};

export interface CreateCustomerLoanPayload {
  customerId: string;
  disbursementAccountId: string;
  principal: { amount: string; currency?: string };
  businessDate: string;
  dueDate?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface RepayCustomerLoanPayload {
  accountId: string;
  amount: { amount: string; currency?: string };
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
}

export interface AdjustCustomerBalancePayload {
  customerId: string;
  balanceType: 'trade_receivable' | 'customer_advance' | 'loan_receivable';
  loanId?: string | null;
  expectedCurrentBalance: { amount: string; currency?: string };
  desiredBalance: { amount: string; currency?: string };
  reason: string;
  category: string;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerFinanceApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  private invalidateMoneyReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.customerLoans,
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
    invalidateAccountFinancialReads(this.queryCache);
  }

  private invalidateAdjustmentReads(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.customerLoans,
      QUERY_CACHE_TAGS.customerPayments,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    );
  }

  listLoans(query: CustomerLoanListQuery = {}): Observable<PaginatedResult<CustomerLoanRecord>> {
    const params = this.paginationParams(query);
    const cacheKey = this.queryCache.buildKey('customer-loans', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customerLoans],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CustomerLoanRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOANS_PATH}`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  getLoan(id: string, options?: { forceRefresh?: boolean }): Observable<CustomerLoanDetailRecord> {
    const cacheKey = this.queryCache.buildKey('customer-loan-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.customerLoans],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: CustomerLoanDetailRecord }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOANS_PATH}/${id}`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data)),
    });
  }

  createLoan(
    payload: CreateCustomerLoanPayload,
    idempotencyKey: string,
  ): Observable<CustomerLoanRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerLoanRecord }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOANS_PATH}`,
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
            tap(() => this.invalidateMoneyReads()),
          ),
      ),
    );
  }

  repayLoan(
    loanId: string,
    payload: RepayCustomerLoanPayload,
    idempotencyKey: string,
  ): Observable<{ id: string; loanId: string; amount: unknown; outstanding: unknown; status: string }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { id: string; loanId: string; amount: unknown; outstanding: unknown; status: string } }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOANS_PATH}/${loanId}/repayments`,
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
            tap(() => this.invalidateMoneyReads()),
          ),
      ),
    );
  }

  reverseLoan(
    loanId: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<CustomerLoanRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerLoanRecord }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOANS_PATH}/${loanId}/reverse`,
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
            tap(() => this.invalidateMoneyReads()),
          ),
      ),
    );
  }

  reverseRepayment(
    repaymentId: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<{ id: string; status: string }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { id: string; status: string } }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_LOAN_REPAYMENTS_PATH}/${repaymentId}/reverse`,
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
            tap(() => this.invalidateMoneyReads()),
          ),
      ),
    );
  }

  adjustBalance(
    payload: AdjustCustomerBalancePayload,
    idempotencyKey: string,
  ): Observable<CustomerBalanceAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerBalanceAdjustmentRecord }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH}`,
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
            tap(() => this.invalidateAdjustmentReads()),
          ),
      ),
    );
  }

  reverseAdjustment(
    adjustmentId: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<CustomerBalanceAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CustomerBalanceAdjustmentRecord }>(
            `${environment.publicApiBaseUrl}${API_CUSTOMER_BALANCE_ADJUSTMENTS_PATH}/${adjustmentId}/reverse`,
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
            tap(() => this.invalidateAdjustmentReads()),
          ),
      ),
    );
  }

  private paginationParams(query: CustomerLoanListQuery): Record<string, string> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.customerId) params['customerId'] = query.customerId;
    if (query.status && query.status !== 'all') params['status'] = query.status;
    if (query.fromDate) params['fromDate'] = query.fromDate;
    if (query.toDate) params['toDate'] = query.toDate;
    if (query.search) params['search'] = query.search;
    return params;
  }
}
