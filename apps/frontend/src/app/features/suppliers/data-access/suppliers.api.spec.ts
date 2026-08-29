import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { SuppliersApi } from './suppliers.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';

const listResponse = {
  data: [
    {
      id: 'sup-1',
      organizationId: 'org-1',
      name: 'Engro Fertilizers',
      phone: '04299000001',
      contactName: 'Ali',
      email: 'ali@engro.test',
      status: 'active',
      version: 1,
      derivedBalances: {
        payable: { amount: '2500.00', currency: 'PKR' },
        advance: { amount: '0.00', currency: 'PKR' },
      },
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

describe('SuppliersApi cache integration', () => {
  let api: SuppliersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SuppliersApi,
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
    api = TestBed.inject(SuppliersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('dedupes identical listSuppliers requests', async () => {
    const first = firstValueFrom(api.listSuppliers({ page: 1, pageSize: 25, status: 'active' }));
    const second = firstValueFrom(api.listSuppliers({ page: 1, pageSize: 25, status: 'active' }));

    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers')).flush(listResponse);

    await Promise.all([first, second]);
  });

  it('uses separate cache entries for list and selector search', async () => {
    const listPromise = firstValueFrom(api.listSuppliers({ page: 1, pageSize: 25, status: 'active' }));
    const optionsPromise = firstValueFrom(api.searchSupplierOptions(''));

    const requests = http.match((candidate) => candidate.url.endsWith('/api/v1/suppliers'));
    expect(requests.length).toBe(2);
    requests.forEach((request) => request.flush(listResponse));

    await Promise.all([listPromise, optionsPromise]);
  });

  it('forceRefresh bypasses cached listSuppliers response', async () => {
    const cached = firstValueFrom(api.listSuppliers({ page: 1, pageSize: 25, status: 'active' }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers')).flush(listResponse);
    await cached;

    const refreshed = firstValueFrom(
      api.listSuppliers({ page: 1, pageSize: 25, status: 'active', forceRefresh: true }),
    );
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers')).flush(listResponse);
    await refreshed;
  });

  it('invalidates cached reads after updateSupplier succeeds', async () => {
    const cached = firstValueFrom(api.searchSupplierOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers')).flush(listResponse);
    await cached;

    const updated = firstValueFrom(
      api.updateSupplier('sup-1', { expectedVersion: 1, name: 'Engro Updated' }),
    );
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers/sup-1'))
      .flush({ data: { ...listResponse.data[0], name: 'Engro Updated', version: 2 } });
    await updated;

    const reload = firstValueFrom(api.searchSupplierOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/suppliers')).flush(listResponse);
    await reload;
  });
});
