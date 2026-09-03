import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { ImportsApi } from './imports.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS, QueryCacheTag } from '../../../shared/data-access/query-cache.tags';
import {
  importExecuteInvalidationTags,
  invalidateImportExecuteEffects,
} from './imports-cache.invalidation';

describe('ImportsApi cache integration', () => {
  let api: ImportsApi;
  let http: HttpTestingController;
  let invalidationCalls: QueryCacheTag[][];

  beforeEach(() => {
    invalidationCalls = [];
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
    api = TestBed.inject(ImportsApi);
    http = TestBed.inject(HttpTestingController);
    const queryCache = TestBed.inject(QueryCacheService);
    const realInvalidateTags = queryCache.invalidateTags.bind(queryCache);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      (...args: Parameters<QueryCacheService['invalidateTags']>) => {
        invalidationCalls.push([...args]);
        realInvalidateTags(...args);
      },
    );
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('reuses template and exact job reads while separating job ids', async () => {
    const templates = firstValueFrom(api.listTemplates());
    http
      .expectOne((request) => request.url.endsWith('/imports/templates'))
      .flush({ data: { items: [] } });
    await templates;
    await firstValueFrom(api.listTemplates());

    const first = firstValueFrom(api.getJob('job-1'));
    const duplicate = firstValueFrom(api.getJob('job-1'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1'))
      .flush({ data: { id: 'job-1' } });
    await Promise.all([first, duplicate]);
    const second = firstValueFrom(api.getJob('job-2'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-2'))
      .flush({ data: { id: 'job-2' } });
    await second;
  });

  it('returns the server download filename and content type', async () => {
    const download = firstValueFrom(api.downloadTemplate('products'));
    const request = http.expectOne((r) => r.url.endsWith('/imports/templates/products'));
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['workbook'], { type: 'application/vnd.ms-excel' }), {
      headers: new HttpHeaders({
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': 'attachment; filename="products-template.xls"',
      }),
    });

    await expect(download).resolves.toMatchObject({
      filename: 'products-template.xls',
      contentType: 'application/vnd.ms-excel',
    });
  });

  it('invalidates cached job and error reads after successful validation without domain tags', async () => {
    const job = firstValueFrom(api.getJob('job-1'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1'))
      .flush({ data: { id: 'job-1' } });
    await job;
    const errors = firstValueFrom(api.listErrors('job-1'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1/errors'))
      .flush({ data: { items: [] } });
    await errors;
    invalidationCalls = [];

    const validated = firstValueFrom(api.validate('job-1'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-1/validate'),
      )
      .flush({ data: { id: 'job-1', importType: 'products' } });
    await validated;

    expect(invalidationCalls).toHaveLength(1);
    expect(invalidationCalls[0]).toEqual([
      QUERY_CACHE_TAGS.importJobs,
      QUERY_CACHE_TAGS.importErrors,
    ]);
    expect(invalidationCalls.some((call) => call.includes(QUERY_CACHE_TAGS.products))).toBe(false);

    const refreshedJob = firstValueFrom(api.getJob('job-1'));
    const refreshedErrors = firstValueFrom(api.listErrors('job-1'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1'))
      .flush({ data: { id: 'job-1' } });
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1/errors'))
      .flush({ data: { items: [] } });
    await Promise.all([refreshedJob, refreshedErrors]);
  });

  it('invalidates product tags after successful product execute', async () => {
    const executed = firstValueFrom(api.execute('job-1', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-1/execute'),
      )
      .flush({ data: { id: 'job-1', importType: 'products' } });
    await executed;

    expect(invalidationCalls.some((call) =>
      call.includes(QUERY_CACHE_TAGS.products) && call.includes(QUERY_CACHE_TAGS.productOptions),
    )).toBe(true);
    expect(invalidationCalls.flat()).not.toContain(QUERY_CACHE_TAGS.customers);
  });

  it('invalidates customer tags after successful customer execute', async () => {
    const executed = firstValueFrom(api.execute('job-2', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-2/execute'),
      )
      .flush({ data: { id: 'job-2', importType: 'customers' } });
    await executed;

    expect(invalidationCalls.some((call) =>
      call.includes(QUERY_CACHE_TAGS.customers) && call.includes(QUERY_CACHE_TAGS.customerOptions),
    )).toBe(true);
  });

  it('invalidates inventory family tags after successful opening stock execute', async () => {
    const executed = firstValueFrom(api.execute('job-3', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-3/execute'),
      )
      .flush({ data: { id: 'job-3', importType: 'opening_stock' } });
    await executed;

    const flatTags = invalidationCalls.flat();
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importJobs);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importErrors);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.inventory);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.stockBalances);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.products);
    expect(flatTags).not.toContain(QUERY_CACHE_TAGS.customers);
  });

  it('invalidates account financial tags but not accountOptions after cash opening execute', async () => {
    const executed = firstValueFrom(api.execute('job-5', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-5/execute'),
      )
      .flush({ data: { id: 'job-5', importType: 'cash_opening_balances' } });
    await executed;

    const flatTags = invalidationCalls.flat();
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importJobs);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importErrors);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.accounts);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.accountsSummary);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.accountMovements);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.dashboard);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.reports);
    expect(flatTags).not.toContain(QUERY_CACHE_TAGS.accountOptions);
  });

  it('invalidates customer financial tags but not customerOptions after opening receivable execute', async () => {
    const executed = firstValueFrom(api.execute('job-6', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-6/execute'),
      )
      .flush({ data: { id: 'job-6', importType: 'customer_opening_receivables' } });
    await executed;

    const flatTags = invalidationCalls.flat();
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importJobs);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importErrors);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.customers);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.customerLedger);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.receivables);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.dashboard);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.reports);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.alerts);
    expect(flatTags).not.toContain(QUERY_CACHE_TAGS.customerOptions);
  });

  it('invalidates supplier financial tags but not supplierOptions after opening payable execute', async () => {
    const executed = firstValueFrom(api.execute('job-7', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-7/execute'),
      )
      .flush({ data: { id: 'job-7', importType: 'supplier_opening_payables' } });
    await executed;

    const flatTags = invalidationCalls.flat();
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importJobs);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.importErrors);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.suppliers);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.supplierLedger);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.payables);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.dashboard);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.reports);
    expect(flatTags).toContain(QUERY_CACHE_TAGS.alerts);
    expect(flatTags).not.toContain(QUERY_CACHE_TAGS.supplierOptions);
  });

  it('does not invalidate domain tags when execute fails', async () => {
    invalidationCalls = [];
    const failed = firstValueFrom(api.execute('job-4', 'execute-key'));
    http
      .expectOne(
        (request) => request.method === 'POST' && request.url.endsWith('/imports/job-4/execute'),
      )
      .flush({}, { status: 400, statusText: 'Bad Request' });
    await expect(failed).rejects.toBeTruthy();
    expect(invalidationCalls).toHaveLength(0);
  });

  it('force refresh bypasses cached import status', async () => {
    const first = firstValueFrom(api.getJob('job-1'));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1'))
      .flush({ data: { id: 'job-1' } });
    await first;
    const refreshed = firstValueFrom(api.getJob('job-1', true));
    http
      .expectOne((request) => request.url.endsWith('/imports/job-1'))
      .flush({ data: { id: 'job-1' } });
    await refreshed;
  });
});

describe('invalidateImportExecuteEffects', () => {
  it('maps supported import types to the minimum affected domain tags', () => {
    expect(importExecuteInvalidationTags('products')).toEqual([
      QUERY_CACHE_TAGS.products,
      QUERY_CACHE_TAGS.productOptions,
    ]);
    expect(importExecuteInvalidationTags('customers')).toEqual([
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerOptions,
    ]);
    expect(importExecuteInvalidationTags('customer_opening_receivables')).toEqual([
      QUERY_CACHE_TAGS.customers,
      QUERY_CACHE_TAGS.customerLedger,
      QUERY_CACHE_TAGS.receivables,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    ]);
    expect(importExecuteInvalidationTags('supplier_opening_payables')).toEqual([
      QUERY_CACHE_TAGS.suppliers,
      QUERY_CACHE_TAGS.supplierLedger,
      QUERY_CACHE_TAGS.payables,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    ]);
    expect(importExecuteInvalidationTags('cash_opening_balances')).toEqual([
      QUERY_CACHE_TAGS.accounts,
      QUERY_CACHE_TAGS.accountsSummary,
      QUERY_CACHE_TAGS.accountMovements,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
    ]);
    expect(importExecuteInvalidationTags('opening_stock')).toEqual([
      QUERY_CACHE_TAGS.inventory,
      QUERY_CACHE_TAGS.batches,
      QUERY_CACHE_TAGS.expiry,
      QUERY_CACHE_TAGS.reconciliation,
      QUERY_CACHE_TAGS.stockMovements,
      QUERY_CACHE_TAGS.stockBalances,
      QUERY_CACHE_TAGS.stockAdjustments,
      QUERY_CACHE_TAGS.stockTransfers,
      QUERY_CACHE_TAGS.products,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    ]);
  });

  it('delegates opening stock to inventory dashboard invalidation helper', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateImportExecuteEffects(queryCache, 'opening_stock');
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.importJobs,
      QUERY_CACHE_TAGS.importErrors,
    );
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(
      QUERY_CACHE_TAGS.inventory,
      QUERY_CACHE_TAGS.batches,
      QUERY_CACHE_TAGS.expiry,
      QUERY_CACHE_TAGS.reconciliation,
      QUERY_CACHE_TAGS.stockMovements,
      QUERY_CACHE_TAGS.stockBalances,
      QUERY_CACHE_TAGS.stockAdjustments,
      QUERY_CACHE_TAGS.stockTransfers,
      QUERY_CACHE_TAGS.products,
      QUERY_CACHE_TAGS.dashboard,
      QUERY_CACHE_TAGS.reports,
      QUERY_CACHE_TAGS.alerts,
    );
  });
});
