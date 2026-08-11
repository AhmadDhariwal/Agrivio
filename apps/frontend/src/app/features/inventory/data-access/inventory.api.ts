import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  ExpiryInventoryRecord,
  InventoryBalanceRecord,
  OpeningStockResult,
  ProductBatchRecord,
  ReconciliationResult,
  StockAdjustmentRecord,
  StockMovementRecord,
  WarehouseTransferRecord,
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

  listExpiry(query?: {
    warehouseId?: string;
    productId?: string;
    classification?: string;
  }): Observable<{ items: ExpiryInventoryRecord[]; businessDate: string; thresholdDays: number }> {
    const params: Record<string, string> = {};
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.classification) {
      params['classification'] = query.classification;
    }
    return this.http
      .get<{
        data: { items: ExpiryInventoryRecord[]; businessDate: string; thresholdDays: number };
      }>(`${environment.publicApiBaseUrl}/api/v1/inventory/expiry`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  listAdjustments(query?: { warehouseId?: string; status?: string }): Observable<StockAdjustmentRecord[]> {
    const params: Record<string, string> = {};
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.status) {
      params['status'] = query.status;
    }
    return this.http
      .get<{ data: { items: StockAdjustmentRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/stock-adjustments`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data.items));
  }

  createAdjustmentDraft(payload: {
    warehouseId: string;
    productId: string;
    adjustmentType: string;
    quantity: string;
    direction?: string;
    batchId?: string;
    reason?: string;
    inventoryValue?: { amount: string; currency: string };
  }): Observable<StockAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: StockAdjustmentRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/stock-adjustments`,
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

  postAdjustment(
    id: string,
    payload: {
      reason: string;
      negativeStockOverride?: boolean;
      negativeStockOverrideReason?: string;
    },
    idempotencyKey: string,
  ): Observable<StockAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: StockAdjustmentRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/stock-adjustments/${id}/post`,
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

  reverseAdjustment(
    id: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<StockAdjustmentRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: StockAdjustmentRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/stock-adjustments/${id}/reverse`,
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

  listTransfers(query?: {
    status?: string;
    sourceWarehouseId?: string;
    destinationWarehouseId?: string;
  }): Observable<WarehouseTransferRecord[]> {
    const params: Record<string, string> = {};
    if (query?.status) {
      params['status'] = query.status;
    }
    if (query?.sourceWarehouseId) {
      params['sourceWarehouseId'] = query.sourceWarehouseId;
    }
    if (query?.destinationWarehouseId) {
      params['destinationWarehouseId'] = query.destinationWarehouseId;
    }
    return this.http
      .get<{ data: { items: WarehouseTransferRecord[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers`,
        { withCredentials: true, params },
      )
      .pipe(map((response) => response.data.items));
  }

  createTransferDraft(payload: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    productId: string;
    quantity: string;
    batchId?: string;
    reason?: string;
    packagingUnitId?: string;
  }): Observable<WarehouseTransferRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: WarehouseTransferRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers`,
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

  postTransfer(
    id: string,
    payload: {
      reason: string;
      negativeStockOverride?: boolean;
      negativeStockOverrideReason?: string;
    },
    idempotencyKey: string,
  ): Observable<WarehouseTransferRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: WarehouseTransferRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers/${id}/post`,
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

  reverseTransfer(
    id: string,
    payload: { reason: string },
    idempotencyKey: string,
  ): Observable<WarehouseTransferRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: WarehouseTransferRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers/${id}/reverse`,
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

  reconcileInventory(): Observable<ReconciliationResult> {
    return this.http
      .get<{ data: ReconciliationResult }>(
        `${environment.publicApiBaseUrl}/api/v1/inventory/reconciliation`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }
}
