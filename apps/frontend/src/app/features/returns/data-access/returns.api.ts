import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  SalesReturnPostInput,
  SalesReturnRecord,
  WithoutInvoiceCreateInput,
} from '../models/returns.models';

@Injectable({ providedIn: 'root' })
export class ReturnsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly baseUrl = `${environment.publicApiBaseUrl}/api/v1/returns`;

  listReturns(params?: { status?: string; returnType?: string; saleId?: string }): Observable<
    SalesReturnRecord[]
  > {
    return this.http
      .get<{ data: { items: SalesReturnRecord[] } }>(this.baseUrl, {
        withCredentials: true,
        params: params ?? {},
      })
      .pipe(map((response) => response.data.items));
  }

  getReturn(id: string): Observable<SalesReturnRecord> {
    return this.http
      .get<{ data: SalesReturnRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  createWithoutInvoice(payload: WithoutInvoiceCreateInput): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(`${this.baseUrl}/without-invoice`, payload, {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          })
          .pipe(map((response) => response.data)),
      ),
    );
  }

  postReturn(
    returnId: string,
    payload: SalesReturnPostInput,
    idempotencyKey: string,
  ): Observable<SalesReturnRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SalesReturnRecord }>(`${this.baseUrl}/${returnId}/post`, payload, {
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
