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
});
