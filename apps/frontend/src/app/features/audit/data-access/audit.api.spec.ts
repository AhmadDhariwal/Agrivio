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
    const req = http.expectOne((r) => r.url.endsWith('/events/evt-123'));
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
});
