import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

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
  private readonly queryCache = inject(QueryCacheService);

  listBranches(
    params: PaginationQuery & { status?: string; search?: string } = {},
    forceRefresh = false,
  ): Observable<PaginatedResult<BranchRecord>> {
    const query = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    };
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('branches:list', query),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.branches],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: BranchRecord[]; meta: PaginatedResult<BranchRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/branches`,
            { withCredentials: true, params: query },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  listBranchOptions(selectedIds: readonly string[] = []): Observable<BranchRecord[]> {
    const normalizedIds = [...new Set(selectedIds.map((id) => id.trim()).filter(Boolean))].sort();
    const params = normalizedIds.length > 0 ? { selectedIds: normalizedIds.join(',') } : {};
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('branches:options', params),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.branchOptions],
      loader: () =>
        this.http
          .get<{ data: { items: BranchRecord[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/branches/options`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  getBranch(id: string, forceRefresh = false): Observable<BranchRecord> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('branches:detail', { id }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.branches],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: BranchRecord }>(`${environment.publicApiBaseUrl}/api/v1/branches/${id}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  createBranch(payload: {
    name: string;
    invoicePrefix: string;
    code?: string;
  }): Observable<BranchRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BranchRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/branches`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBranches()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBranches()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBranches()),
          ),
      ),
    );
  }

  listWarehouses(
    params: PaginationQuery & { status?: string; search?: string } = {},
    forceRefresh = false,
  ): Observable<PaginatedResult<WarehouseRecord>> {
    const query = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    };
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('warehouses:list', query),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.warehouses],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: WarehouseRecord[]; meta: PaginatedResult<WarehouseRecord>['meta'] }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses`,
            { withCredentials: true, params: query },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  listWarehouseOptions(selectedIds: readonly string[] = []): Observable<WarehouseRecord[]> {
    const normalizedIds = [...new Set(selectedIds.map((id) => id.trim()).filter(Boolean))].sort();
    const params = normalizedIds.length > 0 ? { selectedIds: normalizedIds.join(',') } : {};
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('warehouses:options', params),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.warehouseOptions],
      loader: () =>
        this.http
          .get<{ data: { items: WarehouseRecord[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses/options`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  getWarehouse(id: string, forceRefresh = false): Observable<WarehouseRecord> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('warehouses:detail', { id }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.warehouses],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: WarehouseRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouses/${id}`,
            {
              withCredentials: true,
            },
          )
          .pipe(map((response) => response.data)),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateWarehouses()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateWarehouses()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateWarehouses()),
          ),
      ),
    );
  }

  private invalidateBranches(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.branches,
      QUERY_CACHE_TAGS.branchOptions,
      QUERY_CACHE_TAGS.setup,
    );
  }

  private invalidateWarehouses(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.warehouses,
      QUERY_CACHE_TAGS.warehouseOptions,
      QUERY_CACHE_TAGS.setup,
    );
  }
}
