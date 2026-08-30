import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of } from 'rxjs';
import { ExpensesApi } from './expenses.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';

const expenseListResponse = {
  data: [
    {
      id: 'exp-1',
      organizationId: 'org-1',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      categoryName: 'Fuel',
      accountName: 'Cash Register',
      amount: { amount: '5000', currency: 'PKR' },
      purpose: 'Generator fuel',
      expenseDate: '2026-08-05',
      reference: null,
      status: 'posted',
      postedAt: '2026-08-05T10:00:00Z',
      postedBy: 'user-1',
      accountMovementId: 'mov-1',
      correctionOfId: null,
      correctedByExpenseId: null,
      correctedAt: null,
      correctedBy: null,
      reason: null,
      version: 1,
    },
  ],
  meta: { page: 1, pageSize: 25, total: 1 },
};

const categoryListResponse = {
  data: [{ id: 'cat-1', organizationId: 'org-1', name: 'Fuel', status: 'active', version: 1 }],
  meta: { page: 1, pageSize: 25, total: 1 },
};

describe('ExpensesApi cache integration', () => {
  let api: ExpensesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ExpensesApi,
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
    api = TestBed.inject(ExpensesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('dedupes identical listExpenses requests and returns embedded category/account labels', async () => {
    const first = firstValueFrom(api.listExpenses({ page: 1, pageSize: 25 }));
    const second = firstValueFrom(api.listExpenses({ page: 1, pageSize: 25 }));

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/expenses'));
    request.flush(expenseListResponse);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.items[0]?.categoryName).toBe('Fuel');
    expect(firstResult.items[0]?.accountName).toBe('Cash Register');
    expect(secondResult.items).toHaveLength(1);
  });

  it('uses separate cache entries for expense list and category selector search', async () => {
    const listPromise = firstValueFrom(api.listExpenses({ page: 1, pageSize: 25 }));
    const optionsPromise = firstValueFrom(api.searchCategoryOptions(''));

    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/expenses')).flush(expenseListResponse);
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/expense-categories'))
      .flush(categoryListResponse);

    await Promise.all([listPromise, optionsPromise]);
  });

  it('invalidates expense and account financial reads after postExpense succeeds', async () => {
    const cached = firstValueFrom(api.listExpenses({ page: 1, pageSize: 25 }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/expenses')).flush(expenseListResponse);
    await cached;

    const posted = firstValueFrom(
      api.postExpense('exp-1', { expectedVersion: 1 }, 'idem-post-expense'),
    );
    const postRequest = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/expenses/exp-1/post'));
    expect(postRequest.request.method).toBe('POST');
    postRequest.flush({ data: expenseListResponse.data[0] });
    await posted;

    const reload = firstValueFrom(api.listExpenses({ page: 1, pageSize: 25 }));
    http.expectOne((candidate) => candidate.url.endsWith('/api/v1/expenses')).flush(expenseListResponse);
    await reload;
  });

  it('invalidates category options after updateCategory succeeds', async () => {
    const cached = firstValueFrom(api.searchCategoryOptions(''));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/expense-categories'))
      .flush(categoryListResponse);
    await cached;

    const updated = firstValueFrom(
      api.updateCategory('cat-1', { expectedVersion: 1, name: 'Fuel & Transport' }),
    );
    const patchRequest = http.expectOne((candidate) =>
      candidate.url.endsWith('/api/v1/expense-categories/cat-1'),
    );
    patchRequest.flush({
      data: { ...categoryListResponse.data[0], name: 'Fuel & Transport', version: 2 },
    });
    await updated;

    const reload = firstValueFrom(api.searchCategoryOptions(''));
    http
      .expectOne((candidate) => candidate.url.endsWith('/api/v1/expense-categories'))
      .flush(categoryListResponse);
    await reload;
  });
});
