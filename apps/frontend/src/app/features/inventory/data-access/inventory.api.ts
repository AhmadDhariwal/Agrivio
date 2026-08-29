import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
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
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateInventoryDashboardEffects } from '../../dashboard/data-access/dashboard-cache.invalidation';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  private invalidateInventoryReads(): void {
    invalidateInventoryDashboardEffects(this.queryCache);
  }

  listBalances(
    query: PaginationQuery & {
      warehouseId?: string;
      productId?: string;
      batchId?: string;
      forceRefresh?: boolean;
    } = {},
  ): Observable<PaginatedResult<InventoryBalanceRecord>> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.batchId) {
      params['batchId'] = query.batchId;
    }
    const cacheKey = this.queryCache.buildKey('stock-balances', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.stockBalances],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<InventoryBalanceRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/inventory/balances`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  listMovements(
    query: PaginationQuery & {
      warehouseId?: string;
      productId?: string;
      batchId?: string;
      forceRefresh?: boolean;
    } = {},
  ): Observable<PaginatedResult<StockMovementRecord>> {
    const params: Record<string, string> = { page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 25) };
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.batchId) {
      params['batchId'] = query.batchId;
    }
    const cacheKey = this.queryCache.buildKey('movements', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.stockMovements],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<StockMovementRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/inventory/movements`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  listBatches(
    query: PaginationQuery & {
      productId?: string;
      warehouseId?: string;
      search?: string;
      forceRefresh?: boolean;
    } = {},
  ): Observable<PaginatedResult<ProductBatchRecord>> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query?.productId) {
      params['productId'] = query.productId;
    }
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.search) {
      params['search'] = query.search;
    }
    const cacheKey = this.queryCache.buildKey('batches', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.batches],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<ProductBatchRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/inventory/batches`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  getBatch(id: string): Observable<ProductBatchRecord> {
    return this.http
      .get<{ data: ProductBatchRecord }>(
        `${environment.publicApiBaseUrl}/api/v1/inventory/batches/${id}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateInventoryReads()),
          ),
      ),
    );
  }

  listExpiry(query?: {
    warehouseId?: string;
    productId?: string;
    classification?: string;
    forceRefresh?: boolean;
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
    const cacheKey = this.queryCache.buildKey('expiry', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.expiry],
      forceRefresh: query?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{
            data: { items: ExpiryInventoryRecord[]; businessDate: string; thresholdDays: number };
          }>(`${environment.publicApiBaseUrl}/api/v1/inventory/expiry`, {
            withCredentials: true,
            params,
          })
          .pipe(map((response) => response.data)),
    });
  }

  listAdjustments(
    query: PaginationQuery & { warehouseId?: string; forceRefresh?: boolean } = {},
  ): Observable<PaginatedResult<StockAdjustmentRecord>> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    if (query?.status) {
      params['status'] = query.status;
    }
    const cacheKey = this.queryCache.buildKey('adjustments', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.stockAdjustments],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<StockAdjustmentRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/stock-adjustments`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateInventoryReads()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateInventoryReads()),
          ),
      ),
    );
  }

  listTransfers(
    query: PaginationQuery & {
      sourceWarehouseId?: string;
      destinationWarehouseId?: string;
      forceRefresh?: boolean;
    } = {},
  ): Observable<PaginatedResult<WarehouseTransferRecord>> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query?.status) {
      params['status'] = query.status;
    }
    if (query?.sourceWarehouseId) {
      params['sourceWarehouseId'] = query.sourceWarehouseId;
    }
    if (query?.destinationWarehouseId) {
      params['destinationWarehouseId'] = query.destinationWarehouseId;
    }
    const cacheKey = this.queryCache.buildKey('transfers', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'dedupe-only',
      tags: [QUERY_CACHE_TAGS.stockTransfers],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<WarehouseTransferRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  getTransfer(id: string): Observable<WarehouseTransferRecord> {
    return this.http
      .get<{ data: WarehouseTransferRecord }>(
        `${environment.publicApiBaseUrl}/api/v1/warehouse-transfers/${id}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateInventoryReads()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateInventoryReads()),
          ),
      ),
    );
  }

  reconcileInventory(options?: { forceRefresh?: boolean }): Observable<ReconciliationResult> {
    const cacheKey = this.queryCache.buildKey('reconciliation', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.reconciliation],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: ReconciliationResult }>(
            `${environment.publicApiBaseUrl}/api/v1/inventory/reconciliation`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data)),
    });
  }
}
