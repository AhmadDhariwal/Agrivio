import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ExpenseCategoryRecord, ExpenseRecord } from '../models/expenses.models';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';

@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listCategories(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<ExpenseCategoryRecord>> {
    return this.http
      .get<{ data: ExpenseCategoryRecord[]; meta: PaginatedResult<ExpenseCategoryRecord>['meta'] }>(
        `${environment.publicApiBaseUrl}/api/v1/expense-categories`,
        { withCredentials: true, params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  listCategoryOptions(): Observable<ExpenseCategoryRecord[]> {
    return this.listCategories({ page: 1, pageSize: 100, status: 'active' }).pipe(map((result) => result.items));
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
      ),
    );
  }

  listExpenses(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<ExpenseRecord>> {
    return this.http
      .get<{ data: ExpenseRecord[]; meta: PaginatedResult<ExpenseRecord>['meta'] }>(
        `${environment.publicApiBaseUrl}/api/v1/expenses`,
        { withCredentials: true, params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  getExpense(id: string): Observable<ExpenseRecord> {
    return this.http
      .get<{ data: ExpenseRecord }>(`${environment.publicApiBaseUrl}/api/v1/expenses/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
