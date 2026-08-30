import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  AlertsPayload,
  NotificationFeedPayload,
  NotificationItem,
  NotificationsPayload,
} from '../models/alerts.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateAlertReads } from './alerts-cache.invalidation';

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  listAlerts(options?: { forceRefresh?: boolean }): Observable<AlertsPayload> {
    const cacheKey = this.queryCache.buildKey('alerts-summary', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.alerts],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: AlertsPayload }>(`${environment.publicApiBaseUrl}/api/v1/alerts`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  getNotificationFeed(
    limit = 6,
    options?: { forceRefresh?: boolean },
  ): Observable<NotificationFeedPayload> {
    const params = { limit: String(limit) };
    const cacheKey = this.queryCache.buildKey('notifications-feed', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.alerts],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: NotificationFeedPayload }>(
            `${environment.publicApiBaseUrl}/api/v1/notifications/feed`,
            { withCredentials: true, params },
          )
          .pipe(map((response) => response.data)),
    });
  }

  listNotifications(options?: { forceRefresh?: boolean }): Observable<NotificationsPayload> {
    const cacheKey = this.queryCache.buildKey('notifications-list', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.alerts],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: NotificationsPayload }>(
            `${environment.publicApiBaseUrl}/api/v1/notifications`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data)),
    });
  }

  markNotificationRead(id: string): Observable<{ id: string; isRead: boolean; unreadCount: number }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { id: string; isRead: boolean; unreadCount: number } }>(
            `${environment.publicApiBaseUrl}/api/v1/notifications/${id}/read`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAlertReads(this.queryCache)),
          ),
      ),
    );
  }

  markAllNotificationsRead(): Observable<{ success: boolean; unreadCount: number }> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: { success: boolean; unreadCount: number } }>(
            `${environment.publicApiBaseUrl}/api/v1/notifications/mark-all-read`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAlertReads(this.queryCache)),
          ),
      ),
    );
  }

  acknowledgeNotification(id: string): Observable<NotificationItem> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: NotificationItem }>(
            `${environment.publicApiBaseUrl}/api/v1/notifications/${id}/acknowledge`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => invalidateAlertReads(this.queryCache)),
          ),
      ),
    );
  }
}
