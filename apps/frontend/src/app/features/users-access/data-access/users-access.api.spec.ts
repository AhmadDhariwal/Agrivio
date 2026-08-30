import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { UsersAccessApi } from './users-access.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

const response = { data: [], meta: { page: 1, pageSize: 25, total: 0 } };

describe('UsersAccessApi cache integration', () => {
  let api: UsersAccessApi;
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
    api = TestBed.inject(UsersAccessApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('dedupes identical employee lists and keys search separately', async () => {
    const first = firstValueFrom(api.listEmployees({ search: ' Ali ' }));
    const second = firstValueFrom(api.listEmployees({ search: 'Ali' }));
    http.expectOne((request) => request.url.endsWith('/api/v1/users')).flush(response);
    await Promise.all([first, second]);

    const different = firstValueFrom(api.listEmployees({ search: 'Sara' }));
    http.expectOne((request) => request.params.get('search') === 'Sara').flush(response);
    await different;
  });

  it('invalidates cached employee reads after create succeeds', async () => {
    const cached = firstValueFrom(api.listEmployees());
    http.expectOne((request) => request.url.endsWith('/api/v1/users')).flush(response);
    await cached;
    const created = firstValueFrom(
      api.createEmployee({ email: 'a@example.com', displayName: 'A', role: 'Cashier' }),
    );
    http
      .expectOne((request) => request.url.endsWith('/api/v1/users'))
      .flush({ data: { id: 'user-1' } });
    await created;
    const reload = firstValueFrom(api.listEmployees());
    http.expectOne((request) => request.url.endsWith('/api/v1/users')).flush(response);
    await reload;
  });

  it('force refresh bypasses a cached employee list', async () => {
    const cached = firstValueFrom(api.listEmployees());
    http.expectOne((request) => request.url.endsWith('/api/v1/users')).flush(response);
    await cached;
    const refreshed = firstValueFrom(api.listEmployees({}, true));
    http.expectOne((request) => request.url.endsWith('/api/v1/users')).flush(response);
    await refreshed;
  });
});
