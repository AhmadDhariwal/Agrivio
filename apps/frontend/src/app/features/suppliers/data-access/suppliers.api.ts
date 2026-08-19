import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { SupplierRecord } from '../models/suppliers.models';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listSuppliers(query: PaginationQuery = {}): Observable<PaginatedResult<SupplierRecord>> {
    const params = this.paginationParams(query);
    return this.http
      .get<ApiSuccessEnvelope<SupplierRecord[], PaginationMeta>>(
        `${environment.publicApiBaseUrl}/api/v1/suppliers`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta! })));
  }

  searchSupplierOptions(search = ''): Observable<SupplierRecord[]> {
    return this.listSuppliers({ page: 1, pageSize: 25, search, status: 'active' }).pipe(
      map((result) => result.items),
    );
  }

  private paginationParams(query: PaginationQuery): Record<string, string> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.search) params['search'] = query.search;
    if (query.status && query.status !== 'all') params['status'] = query.status;
    return params;
  }

  getSupplier(id: string): Observable<SupplierRecord> {
    return this.http
      .get<{ data: SupplierRecord }>(`${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createSupplier(payload: {
    name: string;
    phone?: string;
    contactName?: string;
    email?: string;
  }): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers`,
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

  updateSupplier(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      phone?: string;
      contactName?: string;
      email?: string;
      status?: string;
    },
  ): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`,
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

  deleteSupplier(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  postOpeningBalance(
    id: string,
    payload: { kind: string; amount: { amount: string; currency: string } },
    idempotencyKey: string,
  ): Observable<SupplierRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SupplierRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/suppliers/${id}/opening-balance`,
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
