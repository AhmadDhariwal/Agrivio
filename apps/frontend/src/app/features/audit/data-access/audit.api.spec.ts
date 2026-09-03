import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { AuditApi } from './audit.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('AuditApi cache integration', () => {
  let api: AuditApi;
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
      ],
    });
    api = TestBed.inject(AuditApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('dedupes an exact normalized audit query and separates pages', async () => {
    const first = firstValueFrom(api.query({ action: ' sale.posted ', page: 1, pageSize: 25 }));
    const second = firstValueFrom(api.query({ pageSize: 25, page: 1, action: 'sale.posted' }));
    http
      .expectOne((request) => request.params.get('page') === '1')
      .flush({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    await Promise.all([first, second]);
    const pageTwo = firstValueFrom(api.query({ action: 'sale.posted', page: 2, pageSize: 25 }));
    http
      .expectOne((request) => request.params.get('page') === '2')
      .flush({ data: [], meta: { page: 2, pageSize: 25, total: 0 } });
    await pageTwo;
  });

  it('fetches and caches single audit event detail by ID', async () => {
    const detailFirst = firstValueFrom(api.getById('evt-123'));
    const detailSecond = firstValueFrom(api.getById('evt-123'));
    const req = http.expectOne((r) => r.url.endsWith('/audit-events/evt-123'));
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'evt-123',
        organizationId: 'org-1',
        actorId: 'usr-1',
        action: 'sale.posted',
        resourceType: 'sale',
        resourceId: 'sale-99',
        reason: 'Normal transaction',
        requestId: 'req-abc',
        occurredAt: '2026-09-02T10:00:00.000Z',
        metadata: { invoiceNumber: 'INV-001' },
      },
    });

    const [firstRes, secondRes] = await Promise.all([detailFirst, detailSecond]);
    expect(firstRes.id).toBe('evt-123');
    expect(firstRes.action).toBe('sale.posted');
    expect(secondRes.id).toBe('evt-123');
  });

  it('loads bounded server-derived filter options and scopes their cache by organization', async () => {
    const first = firstValueFrom(api.getActorOptions(' usr ', 20));
    const req = http.expectOne((request) => request.url.endsWith('/audit-events/filter-options'));
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.params.get('field')).toBe('actorId');
    expect(req.request.params.get('search')).toBe('usr');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({
      data: {
        field: 'actorId',
        items: [{ value: 'usr-1', label: 'User One (one@example.com)' }],
      },
    });
    await expect(first).resolves.toEqual({
      field: 'actorId',
      items: [{ value: 'usr-1', label: 'User One (one@example.com)' }],
    });

    const sessionStore = TestBed.inject(AuthSessionStore) as unknown as {
      activeContext: () => { organizationId: string };
    };
    sessionStore.activeContext = () => ({ organizationId: 'org-2' });
    const second = firstValueFrom(api.getActorOptions('usr', 20));
    http
      .expectOne((request) => request.url.endsWith('/audit-events/filter-options'))
      .flush({
        data: {
          field: 'actorId',
          items: [{ value: 'usr-2', label: 'User Two (two@example.com)' }],
        },
      });
    await expect(second).resolves.toEqual({
      field: 'actorId',
      items: [{ value: 'usr-2', label: 'User Two (two@example.com)' }],
    });
  });

  it('separates the same audit query when the active organization changes', async () => {
    const first = firstValueFrom(api.query({ page: 1, pageSize: 25 }));
    http
      .expectOne((request) => request.url.endsWith('/audit-events'))
      .flush({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    await first;

    const sessionStore = TestBed.inject(AuthSessionStore) as unknown as {
      activeContext: () => { organizationId: string };
    };
    sessionStore.activeContext = () => ({ organizationId: 'org-2' });
    const second = firstValueFrom(api.query({ page: 1, pageSize: 25 }));
    http
      .expectOne((request) => request.url.endsWith('/audit-events'))
      .flush({ data: [], meta: { page: 1, pageSize: 25, total: 0 } });
    await second;
  });

  it('fetches authoritative summary, scopes by organization, and force-refreshes', async () => {
    const first = firstValueFrom(api.getSummary());
    const req = http.expectOne((request) => request.url.endsWith('/audit-events/summary'));
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({
      data: {
        totalEvents: 42,
        eventsToday: 5,
        uniqueActors: 3,
        resourceTypes: 4,
      },
    });
    const summary = await first;
    expect(summary).toEqual({
      totalEvents: 42,
      eventsToday: 5,
      uniqueActors: 3,
      resourceTypes: 4,
    });

    // Deduplicated within short cache
    const cached = firstValueFrom(api.getSummary());
    http.expectNone((request) => request.url.endsWith('/audit-events/summary'));
    await expect(cached).resolves.toEqual(summary);

    // Force refresh triggers a new HTTP request
    const refreshed = firstValueFrom(api.getSummary(true));
    const refreshReq = http.expectOne((request) => request.url.endsWith('/audit-events/summary'));
    refreshReq.flush({
      data: {
        totalEvents: 43,
        eventsToday: 6,
        uniqueActors: 3,
        resourceTypes: 4,
      },
    });
    await expect(refreshed).resolves.toEqual({
      totalEvents: 43,
      eventsToday: 6,
      uniqueActors: 3,
      resourceTypes: 4,
    });
  });
});
