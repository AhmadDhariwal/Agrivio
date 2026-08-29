import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AlertsApi } from './alerts.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { HttpClient } from '@angular/common/http';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateAlertReads } from './alerts-cache.invalidation';

describe('AlertsApi', () => {
  let api: AlertsApi;
  let httpGet: ReturnType<typeof vi.fn>;
  let httpPost: ReturnType<typeof vi.fn>;
  let invalidateTags: ReturnType<typeof vi.fn>;

  const listPayload = {
    items: [],
    summaries: {
      lowStockCount: 0,
      upcomingExpiryCount: 0,
      expiredStockCount: 0,
      deadStockCount: 0,
      customerDuesCount: 0,
      supplierDuesCount: 0,
      customerDuesAmount: { amount: '0.00', currency: 'PKR' },
      supplierDuesAmount: { amount: '0.00', currency: 'PKR' },
    },
    unreadCount: 0,
    businessDate: '2026-08-28',
  };

  const feedPayload = { items: [], unreadCount: 0 };

  beforeEach(() => {
    httpGet = vi.fn();
    httpPost = vi.fn();
    invalidateTags = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        AlertsApi,
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

    api = TestBed.inject(AlertsApi);
    const queryCache = TestBed.inject(QueryCacheService);
    vi.spyOn(queryCache, 'invalidateTags').mockImplementation(
      invalidateTags as (...args: Parameters<QueryCacheService['invalidateTags']>) => void,
    );
  });

  it('dedupes identical notification list queries', () => {
    httpGet.mockReturnValue(of({ data: listPayload }));

    api.listNotifications().subscribe();
    api.listNotifications().subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('dedupes identical navbar feed queries', () => {
    httpGet.mockReturnValue(of({ data: feedPayload }));

    api.getNotificationFeed(6).subscribe();
    api.getNotificationFeed(6).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('uses separate cache keys for feed and list reads', () => {
    httpGet.mockImplementation((url: string) => {
      if (url.endsWith('/notifications/feed')) {
        return of({ data: feedPayload });
      }
      return of({ data: listPayload });
    });

    api.getNotificationFeed(6).subscribe();
    api.listNotifications().subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('invalidates alerts cache after successful mark read', () => {
    httpPost.mockReturnValue(of({ data: { id: 'n1', isRead: true, unreadCount: 0 } }));

    api.markNotificationRead('n1').subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.alerts);
  });

  it('invalidates alerts cache after successful mark all read', () => {
    httpPost.mockReturnValue(of({ data: { success: true, unreadCount: 0 } }));

    api.markAllNotificationsRead().subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.alerts);
  });

  it('invalidates alerts cache after successful acknowledge', () => {
    httpPost.mockReturnValue(
      of({
        data: {
          id: 'n1',
          alertType: 'low_stock',
          title: 'Low stock',
          body: 'Body',
          subjectKey: 'k1',
          fingerprint: 'fp1',
          isRead: false,
          active: true,
          activatedAt: null,
          resolvedAt: null,
          acknowledgedAt: '2026-08-28T00:00:00.000Z',
          acknowledgedBy: 'user-1',
          createdAt: '2026-08-28T00:00:00.000Z',
        },
      }),
    );

    api.acknowledgeNotification('n1').subscribe();

    expect(invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.alerts);
  });

  it('does not invalidate alerts cache when mark read fails', () => {
    httpPost.mockReturnValue(throwError(() => new Error('fail')));

    api.markNotificationRead('n1').subscribe({ error: () => undefined });

    expect(invalidateTags).not.toHaveBeenCalled();
  });

  it('forceRefresh bypasses cached notification list', () => {
    httpGet.mockReturnValue(of({ data: listPayload }));

    api.listNotifications().subscribe();
    api.listNotifications({ forceRefresh: true }).subscribe();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateAlertReads', () => {
  it('targets only the alerts tag family', () => {
    const queryCache = { invalidateTags: vi.fn() } as unknown as QueryCacheService;
    invalidateAlertReads(queryCache);
    expect(queryCache.invalidateTags).toHaveBeenCalledWith(QUERY_CACHE_TAGS.alerts);
  });
});
