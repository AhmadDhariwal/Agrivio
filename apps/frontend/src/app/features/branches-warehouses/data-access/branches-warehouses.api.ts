import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';

export interface BranchRecord {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  invoicePrefix: string;
  status: 'active' | 'inactive' | string;
  version: number;
}

export interface WarehouseRecord {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  status: 'active' | 'inactive' | string;
  version: number;
}

@Injectable({ providedIn: 'root' })
export class BranchesWarehousesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listBranches(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<BranchRecord>> {
    return this.http
      .get<{ data: BranchRecord[]; meta: PaginatedResult<BranchRecord>['meta'] }>(`${environment.publicApiBaseUrl}/api/v1/branches`, {
        withCredentials: true,
        params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) },
      })
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  listBranchOptions(): Observable<BranchRecord[]> {
    return this.listBranches({ page: 1, pageSize: 100, status: 'active' }).pipe(map((result) => result.items));
  }

  getBranch(id: string): Observable<BranchRecord> {
    return this.http
      .get<{ data: BranchRecord }>(`${environment.publicApiBaseUrl}/api/v1/branches/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createBranch(payload: {
    name: string;
    invoicePrefix: string;
    code?: string;
  }): Observable<BranchRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BranchRecord }>(`${environment.publicApiBaseUrl}/api/v1/branches`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  updateBranch(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      invoicePrefix?: string;
      code?: string;
      status?: string;
    },
  ): Observable<BranchRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: BranchRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/branches/${id}`,
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

  deleteBranch(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/branches/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  listWarehouses(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<WarehouseRecord>> {
    return this.http
      .get<{ data: WarehouseRecord[]; meta: PaginatedResult<WarehouseRecord>['meta'] }>(
        `${environment.publicApiBaseUrl}/api/v1/warehouses`,
        { withCredentials: true, params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) } },
      )
      .pipe(map((response) => ({ items: response.data, meta: response.meta })));
  }

  listWarehouseOptions(): Observable<WarehouseRecord[]> {
    return this.listWarehouses({ page: 1, pageSize: 100, status: 'active' }).pipe(map((result) => result.items));
  }

  getWarehouse(id: string): Observable<WarehouseRecord> {
    return this.http
      .get<{ data: WarehouseRecord }>(`${environment.publicApiBaseUrl}/api/v1/warehouses/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createWarehouse(payload: { name: string; code?: string }): Observable<WarehouseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: WarehouseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses`,
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

  updateWarehouse(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      code?: string;
      status?: string;
    },
  ): Observable<WarehouseRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: WarehouseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses/${id}`,
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

  deleteWarehouse(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
