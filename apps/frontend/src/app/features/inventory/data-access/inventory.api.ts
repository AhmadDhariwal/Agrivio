import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  InventoryBalanceRecord,
  OpeningStockResult,
  ProductBatchRecord,
  StockMovementRecord,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listBalances(query?: {
    warehouseId?: string;
    productId?: string;
    batchId?: string;
  }): Observable<InventoryBalanceRecord[]> {
    const params: Record<string, string> = {};
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.batchId) {
      params['batchId'] = query.batchId;
    }
    return this.http
      .get<{ data: { items: InventoryBalanceRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/inventory/balances`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data.items));
  }

  listMovements(query?: {
    warehouseId?: string;
    productId?: string;
    batchId?: string;
  }): Observable<StockMovementRecord[]> {
    const params: Record<string, string> = {};
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.batchId) {
      params['batchId'] = query.batchId;
    }
    return this.http
      .get<{ data: { items: StockMovementRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/inventory/movements`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data.items));
  }

  listBatches(query?: { productId?: string }): Observable<ProductBatchRecord[]> {
    const params: Record<string, string> = {};
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    return this.http
      .get<{ data: { items: ProductBatchRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/inventory/batches`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data.items));
  }

  postOpeningStock(
    payload: {
      warehouseId: string;
      productId: string;
      quantity: string;
      packagingUnitId?: string;
      batchNumber?: string;
      manufacturingDate?: string;
      expiryDate?: string;
      inventoryValue: { amount: string; currency: string };
    },
    idempotencyKey: string,
  ): Observable<OpeningStockResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: OpeningStockResult }>(
            `${environment.publicApiBaseUrl}/api/v1/inventory/opening-stock`,
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
