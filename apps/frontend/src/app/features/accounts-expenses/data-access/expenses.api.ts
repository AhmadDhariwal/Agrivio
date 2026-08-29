import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ExpenseCategoryRecord, ExpenseRecord } from '../models/expenses.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import {
  invalidateExpenseCategoryReads,
  invalidateExpenseFinancialReads,
  invalidateExpenseReads,
} from '../../../shared/data-access/finance-cache.invalidation';

type ExpenseListQuery = PaginationQuery & {
  status?: string;
  search?: string;
  forceRefresh?: boolean;
};

type ExpenseCategoryListQuery = PaginationQuery & {
  status?: string;
  search?: string;
  forceRefresh?: boolean;
};

@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  listCategories(
    params: ExpenseCategoryListQuery = {},
  ): Observable<PaginatedResult<ExpenseCategoryRecord>> {
    const queryParams = this.paginationParams(params);
    if (params.status) {
      queryParams['status'] = params.status;
    }
    if (params.search) {
      queryParams['search'] = params.search;
    }
    const cacheKey = this.queryCache.buildKey('expense-categories', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.expenseCategories],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: ExpenseCategoryRecord[]; meta: PaginatedResult<ExpenseCategoryRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/expense-categories`,
            { withCredentials: true, params: queryParams },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  searchCategoryOptions(search = ''): Observable<ExpenseCategoryRecord[]> {
    const params = this.paginationParams({ page: 1, pageSize: 25, search, status: 'active' });
    const cacheKey = this.queryCache.buildKey('expense-category-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.expenseCategoryOptions],
      loader: () =>
        this.http
          .get<{ data: ExpenseCategoryRecord[]; meta: PaginatedResult<ExpenseCategoryRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/expense-categories`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data)),
    });
  }

  listCategoryOptions(): Observable<ExpenseCategoryRecord[]> {
    return this.searchCategoryOptions('');
  }

  createCategory(payload: { name: string }): Observable<ExpenseCategoryRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: ExpenseCategoryRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/expense-categories`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseCategoryReads(this.queryCache)),
          ),
      ),
    );
  }

  updateCategory(
    id: string,
    payload: { expectedVersion: number; name?: string; status?: string },
  ): Observable<ExpenseCategoryRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: ExpenseCategoryRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/expense-categories/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseCategoryReads(this.queryCache)),
          ),
      ),
    );
  }

  deleteCategory(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/expense-categories/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseCategoryReads(this.queryCache)),
          ),
      ),
    );
  }

  listExpenses(params: ExpenseListQuery = {}): Observable<PaginatedResult<ExpenseRecord>> {
    const queryParams = this.paginationParams(params);
    if (params.status) {
      queryParams['status'] = params.status;
    }
    if (params.search) {
      queryParams['search'] = params.search;
    }
    const cacheKey = this.queryCache.buildKey('expenses', queryParams);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.expenses],
      forceRefresh: params.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: ExpenseRecord[]; meta: PaginatedResult<ExpenseRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/expenses`,
            { withCredentials: true, params: queryParams },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  getExpense(id: string, options?: { forceRefresh?: boolean }): Observable<ExpenseRecord> {
    const cacheKey = this.queryCache.buildKey('expense-detail', { id });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.expenses],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: ExpenseRecord }>(`${environment.publicApiBaseUrl}/api/v1/expenses/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  createExpense(payload: {
    categoryId: string;
    accountId: string;
    amount: { amount: string; currency: string };
    purpose: string;
    expenseDate: string;
    reference?: string;
  }): Observable<ExpenseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: ExpenseRecord }>(`${environment.publicApiBaseUrl}/api/v1/expenses`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseReads(this.queryCache)),
          ),
      ),
    );
  }

  updateExpense(
    id: string,
    payload: {
      expectedVersion: number;
      categoryId?: string;
      accountId?: string;
      amount?: { amount: string; currency: string };
      purpose?: string;
      expenseDate?: string;
      reference?: string;
    },
  ): Observable<ExpenseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: ExpenseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/expenses/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseReads(this.queryCache)),
          ),
      ),
    );
  }

  discardExpense(id: string): Observable<{ discarded: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { discarded: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/expenses/${id}`,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateExpenseReads(this.queryCache)),
          ),
      ),
    );
  }

  postExpense(
    id: string,
    payload: { expectedVersion: number },
    idempotencyKey: string,
  ): Observable<ExpenseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: ExpenseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/expenses/${id}/post`,
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
            tap(() => invalidateExpenseFinancialReads(this.queryCache)),
          ),
      ),
    );
  }

  correctExpense(
    id: string,
    payload: { expectedVersion: number; reason: string },
    idempotencyKey: string,
  ): Observable<ExpenseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: ExpenseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/expenses/${id}/correct`,
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
            tap(() => invalidateExpenseFinancialReads(this.queryCache)),
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
