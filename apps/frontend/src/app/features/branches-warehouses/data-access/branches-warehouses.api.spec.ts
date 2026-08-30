import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { BranchesWarehousesApi } from './branches-warehouses.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

const listResponse = { data: [], meta: { page: 1, pageSize: 25, total: 0 } };

describe('BranchesWarehousesApi cache integration', () => {
  let api: BranchesWarehousesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
      ],
    });
    api = TestBed.inject(BranchesWarehousesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('dedupes identical warehouse lists and separates normalized search queries', async () => {
    const first = firstValueFrom(api.listWarehouses({ search: ' Main ', page: 1 }));
    const second = firstValueFrom(api.listWarehouses({ search: 'Main', page: 1 }));
    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/warehouses'));
    expect(request.request.params.get('search')).toBe('Main');
    request.flush(listResponse);
    await Promise.all([first, second]);

    const different = firstValueFrom(api.listWarehouses({ search: 'North', page: 1 }));
    http.expectOne((candidate) => candidate.params.get('search') === 'North').flush(listResponse);
    await different;
  });

  it('uses complete option endpoints and preserves selected inactive hydration', async () => {
    const branches = firstValueFrom(api.listBranchOptions(['branch-inactive']));
    const branchRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/branches/options'),
    );
    expect(branchRequest.request.params.get('selectedIds')).toBe('branch-inactive');
    branchRequest.flush({ data: { items: [{ id: 'branch-inactive', name: 'Old Branch' }] } });
    await expect(branches).resolves.toHaveLength(1);

    const warehouses = firstValueFrom(api.listWarehouseOptions());
    const warehouseRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/warehouses/options'),
    );
    expect(warehouseRequest.request.params.has('pageSize')).toBe(false);
    warehouseRequest.flush({ data: { items: [] } });
    await warehouses;
  });

  it('invalidates branch reads only after a successful mutation', async () => {
    const cached = firstValueFrom(api.listBranches());
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/branches')).flush(listResponse);
    await cached;

    const failed = firstValueFrom(api.createBranch({ name: 'Bad', invoicePrefix: 'BAD' }));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/branches'))
      .flush({}, { status: 400, statusText: 'Bad Request' });
    await expect(failed).rejects.toBeTruthy();
    await firstValueFrom(api.listBranches());
    http.expectNone((candidate) => candidate.url.endsWith('/api/v1/branches'));

    const created = firstValueFrom(api.createBranch({ name: 'Main', invoicePrefix: 'MAIN' }));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/branches'))
      .flush({ data: { id: 'branch-1' } });
    await created;
    const reload = firstValueFrom(api.listBranches());
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/branches')).flush(listResponse);
    await reload;
  });

  it('force refresh bypasses a cached warehouse list', async () => {
    const first = firstValueFrom(api.listWarehouses());
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/warehouses')).flush(listResponse);
    await first;
    const refreshed = firstValueFrom(api.listWarehouses({}, true));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/warehouses')).flush(listResponse);
    await refreshed;
  });
});
