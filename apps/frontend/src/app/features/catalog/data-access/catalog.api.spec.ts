import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { CatalogApi } from './catalog.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';

const categoryListResponse = {
  data: [
    {
      id: 'cat-1',
      organizationId: 'org-1',
      name: 'Fertilizers',
      productClass: 'fertilizer',
      status: 'active',
      version: 1,
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

const productListResponse = {
  data: [
    {
      id: 'prod-1',
      organizationId: 'org-1',
      categoryId: 'cat-1',
      name: 'Urea 50kg',
      sku: 'UREA-50',
      trackingMode: 'batch',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
      status: 'active',
      version: 1,
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

describe('CatalogApi cache integration', () => {
  let api: CatalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CatalogApi,
        QueryCacheService,
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
        {
          provide: AuthApi,
          useValue: { ensureCsrf: () => of({ csrfToken: 'csrf-token' }) },
        },
      ],
    });
    api = TestBed.inject(CatalogApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('dedupes identical searchCategoryOptions requests', async () => {
    const first = firstValueFrom(api.searchCategoryOptions(''));
    const second = firstValueFrom(api.searchCategoryOptions(''));

    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/product-categories'))
      .flush(categoryListResponse);

    await Promise.all([first, second]);
  });

  it('uses separate cache entries for category list and category selector search', async () => {
    const listPromise = firstValueFrom(api.listCategories({ page: 1, pageSize: 25, status: 'active' }));
    const optionsPromise = firstValueFrom(api.searchCategoryOptions(''));

    const requests = http.match((candidate) => candidate.url.endsWith('/api/v1/product-categories'));
    expect(requests.length).toBe(2);
    requests.forEach((request) => request.flush(categoryListResponse));

    await Promise.all([listPromise, optionsPromise]);
  });

  it('uses separate cache keys for distinct category search terms', async () => {
    const blankPromise = firstValueFrom(api.searchCategoryOptions(''));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/product-categories'))
      .flush(categoryListResponse);
    await blankPromise;

    const searchPromise = firstValueFrom(api.searchCategoryOptions('seed'));
    http
      .expectOne(
        (candidate) =>
          candidate.url.endsWith('/api/v1/product-categories') &&
          candidate.params.get('search') === 'seed',
      )
      .flush(categoryListResponse);
    await searchPromise;
  });

  it('dedupes identical searchProductOptions requests', async () => {
    const first = firstValueFrom(api.searchProductOptions('urea', 25, 'active'));
    const second = firstValueFrom(api.searchProductOptions('urea', 25, 'active'));

    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/products')).flush(productListResponse);

    await Promise.all([first, second]);
  });

  it('invalidates product selector cache after createProduct succeeds', async () => {
    const cached = firstValueFrom(api.searchProductOptions('', 25, 'active'));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/products')).flush(productListResponse);
    await cached;

    const created = firstValueFrom(
      api.createProduct({
        name: 'New Product',
        categoryId: 'cat-1',
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      }),
    );
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/products'))
      .flush({ data: { ...productListResponse.data[0], id: 'prod-2', name: 'New Product' } });
    await created;

    const reload = firstValueFrom(api.searchProductOptions('', 25, 'active'));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/products')).flush(productListResponse);
    await reload;
  });

  it('invalidates category selector cache after createCategory succeeds', async () => {
    const cached = firstValueFrom(api.searchCategoryOptions(''));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/product-categories'))
      .flush(categoryListResponse);
    await cached;

    const created = firstValueFrom(api.createCategory({ name: 'Seeds', productClass: 'seed' }));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/product-categories'))
      .flush({ data: { ...categoryListResponse.data[0], id: 'cat-2', name: 'Seeds' } });
    await created;

    const reload = firstValueFrom(api.searchCategoryOptions(''));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/product-categories'))
      .flush(categoryListResponse);
    await reload;
  });
});
