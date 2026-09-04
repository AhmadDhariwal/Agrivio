import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { PlatformOrganizationsApi } from './platform-organizations.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { environment } from '../../../../environments/environment';

describe('PlatformOrganizationsApi', () => {
  let api: PlatformOrganizationsApi;
  let httpMock: HttpTestingController;
  let authApiMock: { ensureCsrf: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authApiMock = {
      ensureCsrf: vi.fn().mockReturnValue(of({ csrfToken: 'test-csrf-token' })),
    };

    TestBed.configureTestingModule({
      providers: [
        PlatformOrganizationsApi,
        QueryCacheService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: authApiMock },
      ],
    });

    api = TestBed.inject(PlatformOrganizationsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists organizations with server pagination and filters', () => {
    let result: any;
    api.list({ page: 1, pageSize: 10, status: 'approved', search: 'Acme' }).subscribe((res) => {
      result = res;
    });

    const req = httpMock.expectOne((r) =>
      r.url === `${environment.publicApiBaseUrl}/api/v1/platform/organizations` &&
      r.params.get('page') === '1' &&
      r.params.get('pageSize') === '10' &&
      r.params.get('status') === 'approved' &&
      r.params.get('search') === 'Acme',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        {
          id: 'org-1',
          name: 'Acme Farms',
          status: 'approved',
          version: 2,
          ownerEmail: 'owner@acme.com',
          subscription: { id: 'sub-1', status: 'active', planCode: 'Business', planVersion: 1 },
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Acme Farms');
    expect(result.items[0].subscription.planCode).toBe('Business');
  });

  it('fetches authoritative summary KPIs via real server queries', () => {
    let kpis: any;
    api.getSummaryKpis(true).subscribe((res) => {
      kpis = res;
    });

    const requests = httpMock.match((r) =>
      r.url === `${environment.publicApiBaseUrl}/api/v1/platform/organizations`,
    );
    expect(requests.length).toBe(4);

    // total
    requests[0]!.flush({ data: [], meta: { page: 1, pageSize: 1, total: 42 } });
    // active
    requests[1]!.flush({ data: [], meta: { page: 1, pageSize: 1, total: 30 } });
    // suspended
    requests[2]!.flush({ data: [], meta: { page: 1, pageSize: 1, total: 5 } });
    // trial
    requests[3]!.flush({ data: [], meta: { page: 1, pageSize: 1, total: 7 } });

    expect(kpis).toEqual({
      total: 42,
      active: 30,
      suspended: 5,
      trial: 7,
    });
  });

  it('fetches organization detail with composed sections', () => {
    let detail: any;
    api.getById('org-123').subscribe((res) => {
      detail = res;
    });

    const req = httpMock.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/platform/organizations/org-123`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'org-123',
        name: 'Delta Corp',
        status: 'approved',
        version: 3,
        owner: { id: 'u-1', email: 'owner@delta.com', displayName: 'Owner Delta', status: 'active' },
        usage: {
          planCode: 'Enterprise',
          planVersion: 2,
          resources: {
            branches: { current: 2, limit: 5 },
            warehouses: { current: 1, limit: 3 },
            activeUsers: { current: 8, limit: 20 },
          },
        },
      },
    });

    expect(detail.id).toBe('org-123');
    expect(detail.owner.displayName).toBe('Owner Delta');
    expect(detail.usage.resources.branches.current).toBe(2);
    expect(detail.usage.resources.branches.limit).toBe(5);
  });

  it('suspends organization with confirmation and idempotency key', () => {
    let response: any;
    api
      .suspend('org-123', { expectedVersion: 3, reason: 'Non-payment', confirmed: true })
      .subscribe((res) => {
        response = res;
      });

    const req = httpMock.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/platform/organizations/org-123/suspend`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(req.request.body).toEqual({
      expectedVersion: 3,
      reason: 'Non-payment',
      confirmed: true,
    });

    req.flush({
      data: { organizationId: 'org-123', status: 'suspended', version: 4 },
    });

    expect(response.status).toBe('suspended');
    expect(response.version).toBe(4);
  });

  it('reactivates suspended organization', () => {
    let response: any;
    api
      .reactivate('org-123', { expectedVersion: 4, reason: 'Payment received' })
      .subscribe((res) => {
        response = res;
      });

    const req = httpMock.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/platform/organizations/org-123/reactivate`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(req.request.body).toEqual({
      expectedVersion: 4,
      reason: 'Payment received',
    });

    req.flush({
      data: { organizationId: 'org-123', status: 'approved', version: 5 },
    });

    expect(response.status).toBe('approved');
    expect(response.version).toBe(5);
  });

  it('updates organization profile with expectedVersion and reason', () => {
    let response: any;
    api
      .update('org-123', {
        expectedVersion: 5,
        reason: 'Relocation',
        name: 'Delta Global',
        timezone: 'Asia/Dubai',
      })
      .subscribe((res) => {
        response = res;
      });

    const req = httpMock.expectOne(
      `${environment.publicApiBaseUrl}/api/v1/platform/organizations/org-123`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(req.request.body).toEqual({
      expectedVersion: 5,
      reason: 'Relocation',
      name: 'Delta Global',
      timezone: 'Asia/Dubai',
    });

    req.flush({
      data: {
        id: 'org-123',
        name: 'Delta Global',
        status: 'approved',
        version: 6,
        timezone: 'Asia/Dubai',
      },
    });

    expect(response.name).toBe('Delta Global');
    expect(response.version).toBe(6);
  });
});
