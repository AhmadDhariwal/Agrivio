import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { AccountsApi } from './accounts.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';

const accountListResponse = {
  data: [
    {
      id: 'acc-1',
      organizationId: 'org-1',
      accountType: 'cash',
      name: 'Cash Register',
      bankName: '',
      accountNumberMasked: '',
      walletIdentifier: '',
      status: 'active',
      version: 1,
      derivedBalances: { balance: { amount: '25000.00', currency: 'PKR' } },
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

const summaryResponse = {
  data: {
    totalAccounts: 10,
    activeAccounts: 8,
    inactiveAccounts: 2,
    totalBalance: { amount: '1500000.00', currency: 'PKR' },
  },
};

describe('AccountsApi cache integration', () => {
  let api: AccountsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AccountsApi,
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
    api = TestBed.inject(AccountsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('dedupes identical listAccounts requests without per-row detail calls', async () => {
    const first = firstValueFrom(api.listAccounts({ page: 1, pageSize: 25, status: 'active' }));
    const second = firstValueFrom(api.listAccounts({ page: 1, pageSize: 25, status: 'active' }));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts'));
    request.flush(accountListResponse);

    await Promise.all([first, second]);
  });

  it('uses authoritative summary endpoint with dedupe-only policy', async () => {
    const first = firstValueFrom(api.getSummary());
    const second = firstValueFrom(api.getSummary());

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts/summary'));
    request.flush(summaryResponse);

    const [firstSummary, secondSummary] = await Promise.all([first, second]);
    expect(firstSummary.totalBalance.amount).toBe('1500000.00');
    expect(secondSummary.totalAccounts).toBe(10);
  });

  it('invalidates account options after lifecycle update without touching unrelated tenants', async () => {
    const cached = firstValueFrom(api.searchAccountOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts')).flush(accountListResponse);
    await cached;

    const updated = firstValueFrom(
      api.updateAccount('acc-1', { expectedVersion: 1, status: 'inactive' }),
    );
    const patchRequest = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts/acc-1'));
    patchRequest.flush({
      data: { ...accountListResponse.data[0], status: 'inactive', version: 2 },
    });
    await updated;

    const reload = firstValueFrom(api.searchAccountOptions(''));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts')).flush({
      ...accountListResponse,
      data: [],
    });
    const options = await reload;
    expect(options).toEqual([]);
  });

  it('invalidates financial reads after postOpeningBalance succeeds', async () => {
    const cached = firstValueFrom(api.getSummary());
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts/summary')).flush(summaryResponse);
    await cached;

    const posted = firstValueFrom(
      api.postOpeningBalance('acc-1', { amount: { amount: '1000.00', currency: 'PKR' } }, 'idem-open'),
    );
    const postRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/api/v1/accounts/acc-1/opening-balance'),
    );
    postRequest.flush({ data: accountListResponse.data[0] });
    await posted;

    const reload = firstValueFrom(api.getSummary());
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/accounts/summary')).flush(summaryResponse);
    await reload;
  });
});
