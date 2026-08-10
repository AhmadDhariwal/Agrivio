import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { SupplierRecord } from '../models/suppliers.models';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listSuppliers(): Observable<SupplierRecord[]> {
    return this.http
      .get<{ data: { items: SupplierRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/suppliers`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
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
}
