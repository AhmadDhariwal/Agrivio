import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';

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

  listBranches(): Observable<BranchRecord[]> {
    return this.http
      .get<{ data: { items: BranchRecord[] } }>(`${environment.publicApiBaseUrl}/api/v1/branches`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
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

  listWarehouses(): Observable<WarehouseRecord[]> {
    return this.http
      .get<{ data: { items: WarehouseRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/warehouses`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
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
