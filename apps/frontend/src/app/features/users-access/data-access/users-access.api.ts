import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { PaginationMeta } from '@agrivio/api-contracts';
import { PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { BranchesWarehousesApi } from '../../branches-warehouses/data-access/branches-warehouses.api';

export type OrganizationRole = 'Owner' | 'Manager' | 'Cashier' | 'StoreKeeper';

export interface EmployeeRecord {
  id: string;
  membershipId: string;
  email: string;
  displayName: string;
  role: OrganizationRole | string;
  status: string;
  userStatus: string;
  version: number;
  branchIds: string[];
  warehouseIds: string[];
  activationToken?: string;
  activationUrl?: string;
  activationPath?: string;
  activationTokenExpiresAt?: string;
}

export interface AssignmentTarget {
  id: string;
  name: string;
}

export interface EmployeeStatusSummary {
  total: number;
  active: number;
  pendingInactive: number;
}

export interface EmployeeListMeta extends PaginationMeta {
  summary?: EmployeeStatusSummary;
}

@Injectable({ providedIn: 'root' })
export class UsersAccessApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly locationsApi = inject(BranchesWarehousesApi);

  listEmployees(
    params: PaginationQuery & { search?: string } = {},
    forceRefresh = false,
  ): Observable<{ items: EmployeeRecord[]; meta: EmployeeListMeta }> {
    const query = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    };
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('employees:list', query),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.employees],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: EmployeeRecord[]; meta: EmployeeListMeta }>(
            `${environment.publicApiBaseUrl}/api/v1/users`,
            { withCredentials: true, params: query },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  getEmployee(id: string, forceRefresh = false): Observable<EmployeeRecord> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('employees:detail', { id }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.employees, QUERY_CACHE_TAGS.employeeAccess],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: EmployeeRecord }>(`${environment.publicApiBaseUrl}/api/v1/users/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  listAssignmentBranches(selectedIds: readonly string[] = []): Observable<AssignmentTarget[]> {
    return this.locationsApi
      .listBranchOptions(selectedIds)
      .pipe(map((items) => items.map((item) => ({ id: item.id, name: item.name }))));
  }

  listAssignmentWarehouses(selectedIds: readonly string[] = []): Observable<AssignmentTarget[]> {
    return this.locationsApi
      .listWarehouseOptions(selectedIds)
      .pipe(map((items) => items.map((item) => ({ id: item.id, name: item.name }))));
  }

  createEmployee(payload: {
    email: string;
    displayName: string;
    role: OrganizationRole;
  }): Observable<EmployeeRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: EmployeeRecord }>(`${environment.publicApiBaseUrl}/api/v1/users`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateEmployees()),
          ),
      ),
    );
  }

  updateEmployee(
    id: string,
    payload: {
      expectedVersion: number;
      displayName?: string;
      role?: OrganizationRole;
    },
  ): Observable<EmployeeRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: EmployeeRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/users/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateEmployees()),
          ),
      ),
    );
  }

  deactivateEmployee(id: string): Observable<EmployeeRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: EmployeeRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/users/${id}/deactivate`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateEmployees()),
          ),
      ),
    );
  }

  replaceAccessAssignments(
    id: string,
    payload: { branchIds: string[]; warehouseIds: string[] },
  ): Observable<{
    membershipId: string;
    userId: string;
    branchIds: string[];
    warehouseIds: string[];
  }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .put<{
            data: {
              membershipId: string;
              userId: string;
              branchIds: string[];
              warehouseIds: string[];
            };
          }>(`${environment.publicApiBaseUrl}/api/v1/users/${id}/access-assignments`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(
                QUERY_CACHE_TAGS.employees,
                QUERY_CACHE_TAGS.employeeAccess,
              ),
            ),
          ),
      ),
    );
  }

  private invalidateEmployees(): void {
    this.queryCache.invalidateTags(QUERY_CACHE_TAGS.employees, QUERY_CACHE_TAGS.setup);
  }
}
