import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  CategoryRecord,
  PackagingUnitRecord,
  PackagingUnitsReplaceResult,
  ProductPriceRecord,
  ProductPricesReplaceResult,
  ProductRecord,
} from '../models/catalog.models';
import { ApiSuccessEnvelope, PaginationMeta } from '@agrivio/api-contracts';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

interface ProductListQuery extends PaginationQuery {
  q?: string;
  includeListSummary?: boolean;
  forceRefresh?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  listCategories(
    query: PaginationQuery & { forceRefresh?: boolean } = {},
  ): Observable<PaginatedResult<CategoryRecord>> {
    const params = this.paginationParams(query);
    const cacheKey = this.queryCache.buildKey('categories', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.categories],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CategoryRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/product-categories`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta! }))),
    });
  }

  searchCategoryOptions(search = ''): Observable<CategoryRecord[]> {
    const params = this.paginationParams({ page: 1, pageSize: 25, search, status: 'active' });
    const cacheKey = this.queryCache.buildKey('category-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.categoryOptions],
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<CategoryRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/product-categories`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data)),
    });
  }

  getCategory(id: string): Observable<CategoryRecord> {
    return this.http
      .get<{ data: CategoryRecord }>(
        `${environment.publicApiBaseUrl}/api/v1/product-categories/${id}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  createCategory(payload: {
    name: string;
    productClass?: string;
  }): Observable<CategoryRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: CategoryRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/product-categories`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(
                QUERY_CACHE_TAGS.categories,
                QUERY_CACHE_TAGS.categoryOptions,
                QUERY_CACHE_TAGS.products,
                QUERY_CACHE_TAGS.productOptions,
              ),
            ),
          ),
      ),
    );
  }

  updateCategory(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      productClass?: string;
      status?: string;
    },
  ): Observable<CategoryRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: CategoryRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/product-categories/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(
                QUERY_CACHE_TAGS.categories,
                QUERY_CACHE_TAGS.categoryOptions,
                QUERY_CACHE_TAGS.products,
                QUERY_CACHE_TAGS.productOptions,
              ),
            ),
          ),
      ),
    );
  }

  deleteCategory(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/product-categories/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(
                QUERY_CACHE_TAGS.categories,
                QUERY_CACHE_TAGS.categoryOptions,
                QUERY_CACHE_TAGS.products,
                QUERY_CACHE_TAGS.productOptions,
              ),
            ),
          ),
      ),
    );
  }

  listProducts(query: ProductListQuery = {}): Observable<PaginatedResult<ProductRecord>> {
    const params = this.paginationParams(query);
    if (query.q) params['q'] = query.q;
    if (query.includeListSummary) {
      params['includeListSummary'] = 'true';
    }
    const cacheKey = this.queryCache.buildKey('products', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.products],
      forceRefresh: query.forceRefresh === true,
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<ProductRecord[], PaginationMeta>>(
            `${environment.publicApiBaseUrl}/api/v1/products`,
            { withCredentials: true, params },
          )
          .pipe(
            map((response) => ({
              items: (response.data || []).map((p: ProductRecord & { _id?: string }) => ({
                ...p,
                id: p.id || p._id || '',
              })),
              meta: response.meta!,
            })),
          ),
    });
  }

  searchProductOptions(q = '', limit = 25, status = 'active'): Observable<ProductRecord[]> {
    const params: Record<string, string> = { q, limit: String(Math.min(50, Math.max(1, limit))) };
    if (status && status !== 'all') {
      params['status'] = status;
    }
    const cacheKey = this.queryCache.buildKey('product-options', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.productOptions],
      loader: () =>
        this.http
          .get<ApiSuccessEnvelope<ProductRecord[]>>(`${environment.publicApiBaseUrl}/api/v1/products`, {
            withCredentials: true,
            params,
          })
          .pipe(
            map((response) =>
              (response.data || []).map((p: ProductRecord & { _id?: string }) => ({
                ...p,
                id: p.id || p._id || '',
              })),
            ),
          ),
    });
  }

  private paginationParams(query: PaginationQuery): Record<string, string> {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? 25),
    };
    if (query.search) params['search'] = query.search;
    if (query.status && query.status !== 'all') params['status'] = query.status;
    return params;
  }

  getProduct(id: string): Observable<ProductRecord> {
    return this.http
      .get<{ data: ProductRecord }>(`${environment.publicApiBaseUrl}/api/v1/products/${id}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  createProduct(payload: {
    name: string;
    categoryId: string;
    trackingMode: string;
    baseUnitCode: string;
    measurementDimension: string;
    sku?: string;
  }): Observable<ProductRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: ProductRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/products`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions)),
          ),
      ),
    );
  }

  updateProduct(
    id: string,
    payload: {
      expectedVersion: number;
      name?: string;
      categoryId?: string;
      trackingMode?: string;
      baseUnitCode?: string;
      measurementDimension?: string;
      sku?: string;
      status?: string;
    },
  ): Observable<ProductRecord> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: ProductRecord }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions)),
          ),
      ),
    );
  }

  deleteProduct(id: string): Observable<{ id: string; deleted: boolean }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .delete<{ data: { id: string; deleted: boolean } }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${id}`,
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions)),
          ),
      ),
    );
  }

  listPackagingUnits(productId: string): Observable<PackagingUnitRecord[]> {
    const cacheKey = this.queryCache.buildKey('product-packaging-units', { productId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.productOptions],
      loader: () =>
        this.http
          .get<{ data: { items: PackagingUnitRecord[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${productId}/packaging-units`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  replacePackagingUnits(
    productId: string,
    payload: {
      expectedVersion: number;
      items: Array<{ name: string; conversionFactor: string; status?: string }>;
    },
  ): Observable<PackagingUnitsReplaceResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .put<{ data: PackagingUnitsReplaceResult }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${productId}/packaging-units`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions)),
          ),
      ),
    );
  }

  listPrices(productId: string): Observable<ProductPriceRecord[]> {
    const cacheKey = this.queryCache.buildKey('product-prices', { productId });
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.productOptions],
      loader: () =>
        this.http
          .get<{ data: { items: ProductPriceRecord[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${productId}/prices`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  replacePrices(
    productId: string,
    payload: {
      expectedVersion: number;
      items: Array<{
        priceTier: string;
        price: { amount: string; currency: string };
        status?: string;
      }>;
    },
  ): Observable<ProductPricesReplaceResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .put<{ data: ProductPricesReplaceResult }>(
            `${environment.publicApiBaseUrl}/api/v1/products/${productId}/prices`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.products, QUERY_CACHE_TAGS.productOptions)),
          ),
      ),
    );
  }
}
