import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { API_SALES_PATH, ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { invalidateAccountFinancialReads } from '../../../shared/data-access/finance-cache.invalidation';
import {
  SaleDraftInput,
  SaleDraftUpdateInput,
  SalePostInput,
  SaleCancelInput,
  SaleRecord,
  SalePrintInvoice,
  PosPaymentAccount,
} from '../models/sales.models';

@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_SALES_PATH}`;

  listSales(params: PaginationQuery & { customerId?: string; warehouseId?: string; branchId?: string } = {}): Observable<PaginatedResult<SaleRecord>> {
    const query = { ...params, page: params.page ?? 1, pageSize: params.pageSize ?? 25 };
    return this.http
      .get<ApiSuccessEnvelope<SaleRecord[], PaginationMeta>>(this.baseUrl, {
        withCredentials: true,
        params: query,
      })
      .pipe(map((response) => ({ items: response.data, meta: response.meta! })));
  }

  getSale(id: string): Observable<SaleRecord> {
    return this.http
      .get<{ data: SaleRecord }>(`${this.baseUrl}/${id}`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  getPrintInvoice(id: string): Observable<SalePrintInvoice> {
    return this.http
      .get<{ data: SalePrintInvoice }>(`${this.baseUrl}/${id}/print`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  listPosPaymentAccounts(): Observable<PosPaymentAccount[]> {
    return this.http
      .get<{ data: { items: PosPaymentAccount[] } }>(`${this.baseUrl}/payment-accounts`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAccountFinancialReads(this.queryCache)),
          ),
      ),
    );
  }
}
