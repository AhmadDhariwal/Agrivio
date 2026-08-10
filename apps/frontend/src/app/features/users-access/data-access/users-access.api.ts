import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';

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

@Injectable({ providedIn: 'root' })
export class UsersAccessApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listEmployees(): Observable<EmployeeRecord[]> {
    return this.http
      .get<{ data: { items: EmployeeRecord[] } }>(`${environment.publicApiBaseUrl}/api/v1/users`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
  }

  getEmployee(id: string): Observable<EmployeeRecord> {
    return this.http
      .get<{ data: EmployeeRecord }>(`${environment.publicApiBaseUrl}/api/v1/users/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  listAssignmentBranches(): Observable<AssignmentTarget[]> {
    return this.http
      .get<{ data: { items: Array<{ id: string; name: string }> } }>(
        `${environment.publicApiBaseUrl}/api/v1/branches`,
        { withCredentials: true },
      )
      .pipe(
        map((response) => response.data.items.map((item) => ({ id: item.id, name: item.name }))),
      );
  }

  listAssignmentWarehouses(): Observable<AssignmentTarget[]> {
    return this.http
      .get<{ data: { items: Array<{ id: string; name: string }> } }>(
        `${environment.publicApiBaseUrl}/api/v1/warehouses`,
        { withCredentials: true },
      )
      .pipe(
        map((response) => response.data.items.map((item) => ({ id: item.id, name: item.name }))),
      );
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
