import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { API_SALES_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { SaleDraftInput, SaleDraftUpdateInput, SalePostInput, SaleCancelInput, SaleRecord } from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_SALES_PATH}`;

  listSales(params?: { status?: string; customerId?: string }): Observable<SaleRecord[]> {
    return this.http
      .get<{ data: { items: SaleRecord[] } }>(this.baseUrl, {
        withCredentials: true,
        params: params ?? {},
      })
      .pipe(map((response) => response.data.items));
  }

  getSale(id: string): Observable<SaleRecord> {
    return this.http
      .get<{ data: SaleRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  createSale(payload: SaleDraftInput): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(this.baseUrl, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  updateSale(id: string, payload: SaleDraftUpdateInput): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: SaleRecord }>(`${this.baseUrl}/${id}`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  discardSale(id: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.delete(`${this.baseUrl}/${id}`, {
          withCredentials: true,
          headers: { 'X-CSRF-Token': csrfToken },
        }),
      ),
    );
  }

  postSale(id: string, payload: SalePostInput, idempotencyKey: string): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(`${this.baseUrl}/${id}/post`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  cancelSale(id: string, payload: SaleCancelInput, idempotencyKey: string): Observable<SaleRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SaleRecord }>(`${this.baseUrl}/${id}/cancel`, payload, {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrfToken,
              'Idempotency-Key': idempotencyKey,
            },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
