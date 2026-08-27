import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  AlertsPayload,
  NotificationFeedPayload,
  NotificationItem,
  NotificationsPayload,
} from '../models/alerts.models';

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  listAlerts(): Observable<AlertsPayload> {
    return this.http
      .get<{ data: AlertsPayload }>(`${environment.publicApiBaseUrl}/api/v1/alerts`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  getNotificationFeed(limit = 6): Observable<NotificationFeedPayload> {
    return this.http
      .get<{ data: NotificationFeedPayload }>(
        `${environment.publicApiBaseUrl}/api/v1/notifications/feed?limit=${limit}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  listNotifications(): Observable<NotificationsPayload> {
    return this.http
      .get<{ data: NotificationsPayload }>(
        `${environment.publicApiBaseUrl}/api/v1/notifications`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
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
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
