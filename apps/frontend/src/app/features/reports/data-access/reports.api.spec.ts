import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ReportsApi } from './reports.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { HttpClient } from '@angular/common/http';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { ReportDataset } from '../models/reports.models';

describe('ReportsApi', () => {
  let api: ReportsApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;

  const dataset: ReportDataset = {
    reportKey: 'sales',
    title: 'Sales',
    columns: [{ key: 'total', label: 'Total' }],
    rows: [{ total: '100.00' }],
    totals: { total: '100.00' },
    filters: {},
  };

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReportsApi,
        QueryCacheService,
        {
          provide: HttpClient,
          useValue: { get: httpGet, post: httpPost },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(ReportsApi);
  });

  it('dedupes identical report queries through QueryCacheService', () => {
    httpGet.mockReturnValue(of({ data: dataset }));

    api.getReport('sales', { fromDate: '2026-08-01', toDate: '2026-08-28' }).subscribe();
    api.getReport('sales', { fromDate: '2026-08-01', toDate: '2026-08-28' }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('uses different cache entries for different report filters', () => {
    httpGet.mockReturnValue(of({ data: dataset }));

    api.getReport('sales', { branchId: 'br-1' }).subscribe();
    api.getReport('sales', { branchId: 'br-2' }).subscribe();
    api.getReport('purchases', { branchId: 'br-1' }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(3);
  });

  it('tags report reads with short policy and reports tag', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');
    httpGet.mockReturnValue(of({ data: dataset }));

    api.getReport('sales', { fromDate: '2026-08-01' }).subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.reports],
      }),
    );
  });

  it('forceRefresh bypasses cached report response', () => {
    httpGet.mockReturnValue(of({ data: dataset }));

    api.getReport('sales', { fromDate: '2026-08-01' }).subscribe();
    api.getReport('sales', { fromDate: '2026-08-01' }, { forceRefresh: true }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed report requests', () => {
    httpGet
      .mockImplementationOnce(() => throwError(() => new Error('fail')))
      .mockImplementationOnce(() => of({ data: dataset }));

    api.getReport('sales', {}).subscribe({ error: () => undefined });
    api.getReport('sales', {}).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('does not cache export responses', () => {
    httpPost.mockReturnValue(of(new Blob(['pdf'])));

    api.exportReport('sales', 'pdf', { fromDate: '2026-08-01' }).subscribe();
    api.exportReport('sales', 'pdf', { fromDate: '2026-08-01' }).subscribe();

    expect(httpPost).toHaveBeenCalledTimes(2);
  });
});
