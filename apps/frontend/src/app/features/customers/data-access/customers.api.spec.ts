import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { CustomersApi } from './customers.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';

const listResponse = {
  data: [
    {
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Kisan Dost',
      phone: '03001234567',
      customerType: 'individual',
      priceTier: 'retail',
      creditEnabled: false,
      creditLimit: { amount: '0', currency: 'PKR' },
      creditLimitBehaviour: 'warning',
      status: 'active',
      version: 1,
      derivedBalances: {
        receivable: { amount: '1000.00', currency: 'PKR' },
        advance: { amount: '0.00', currency: 'PKR' },
      },
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

describe('CustomersApi cache integration', () => {
  let api: CustomersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CustomersApi,
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
    api = TestBed.inject(CustomersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('dedupes identical listCustomers requests', async () => {
    const first = firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));
    const second = firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers'));
    request.flush(listResponse);

    await Promise.all([first, second]);
  });

  it('uses separate cache entries for list and selector search', async () => {
    const listPromise = firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));
    const optionsPromise = firstValueFrom(api.searchCustomerOptions(''));

    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);

    await Promise.all([listPromise, optionsPromise]);
  });

  it('forceRefresh bypasses cached listCustomers response', async () => {
    await firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);

    const refreshed = firstValueFrom(
      api.listCustomers({ page: 1, pageSize: 25, status: 'active', forceRefresh: true }),
    );
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);
    await refreshed;
  });

  it('invalidates cached reads after createCustomer succeeds', async () => {
    await firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);

    const created = firstValueFrom(
      api.createCustomer({ name: 'New Customer', customerType: 'individual' }),
    );
    const createRequest = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers'));
    expect(createRequest.request.method).toBe('POST');
    createRequest.flush({ data: { ...listResponse.data[0], id: 'cust-2', name: 'New Customer' } });
    await created;

    const reload = firstValueFrom(api.listCustomers({ page: 1, pageSize: 25, status: 'active' }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);
    await reload;
  });

  it('invalidates financial read families after opening balance posting', async () => {
    vi.spyOn(TestBed.inject(QueryCacheService), 'invalidateTags');

    await firstValueFrom(api.searchCustomerOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);

    const posted = firstValueFrom(
      api.postOpeningBalance(
        'cust-1',
        { kind: 'receivable', amount: { amount: '500.00', currency: 'PKR' } },
        'idem-1',
      ),
    );
    const postRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/api/v1/customers/cust-1/opening-balance'),
    );
    postRequest.flush({ data: listResponse.data[0] });
    await posted;

    const optionsReload = firstValueFrom(api.searchCustomerOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/customers')).flush(listResponse);
    await optionsReload;
  });
});
