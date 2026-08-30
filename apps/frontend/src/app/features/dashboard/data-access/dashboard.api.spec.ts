import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { DashboardApi } from './dashboard.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { HttpClient } from '@angular/common/http';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { DashboardPayload } from '../models/dashboard.models';

describe('DashboardApi', () => {
  let api: DashboardApi;
  let httpGet: ReturnType<typeof vi.fn>;

  const payload: DashboardPayload = {
    businessDate: '2026-08-28',
    period: { fromDate: '2026-08-22', toDate: '2026-08-28' },
    entitlements: { reportsExportsAllowed: true },
    periodSales: { amount: '100.00', currency: 'PKR' },
  };

  beforeEach(() => {
    httpGet = vi.fn().mockReturnValue(of({ data: payload }));

    TestBed.configureTestingModule({
      providers: [
        DashboardApi,
        QueryCacheService,
        {
          provide: HttpClient,
          useValue: { get: httpGet },
        },
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
      ],
    });

    api = TestBed.inject(DashboardApi);
  });

  it('dedupes identical dashboard queries through QueryCacheService', () => {
    api.getDashboard({ fromDate: '2026-08-01', toDate: '2026-08-28' }).subscribe();
    api.getDashboard({ fromDate: '2026-08-01', toDate: '2026-08-28' }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('uses different cache entries for different filter combinations', () => {
    api.getDashboard({ branchId: 'br-1' }).subscribe();
    api.getDashboard({ branchId: 'br-2' }).subscribe();
    api.getDashboard({ warehouseId: 'wh-1' }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(3);
  });

  it('tags dashboard reads with short policy and dashboard tag', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const fetchSpy = vi.spyOn(queryCache, 'fetch');

    api.getDashboard().subscribe();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: 'short',
        tags: [QUERY_CACHE_TAGS.dashboard],
      }),
    );
  });

  it('forceRefresh bypasses cached dashboard response', () => {
    api.getDashboard().subscribe();
    api.getDashboard({ forceRefresh: true }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed dashboard requests', () => {
    httpGet
      .mockImplementationOnce(() => throwError(() => new Error('fail')))
      .mockImplementationOnce(() => of({ data: payload }));

    api.getDashboard().subscribe({ error: () => undefined });
    api.getDashboard().subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('scopes dashboard cache keys by organization', () => {
    const queryCache = TestBed.inject(QueryCacheService);
    const keyOrg1 = queryCache.buildKey('dashboard', { branchId: 'br-1' });

    const sessionStore = TestBed.inject(AuthSessionStore) as { activeContext: () => { organizationId: string } | null };
    sessionStore.activeContext = () => ({ organizationId: 'org-2' });
    const keyOrg2 = queryCache.buildKey('dashboard', { branchId: 'br-1' });

    expect(keyOrg1).not.toBe(keyOrg2);
    expect(keyOrg1).toContain('org:org-1');
    expect(keyOrg2).toContain('org:org-2');
  });
});
