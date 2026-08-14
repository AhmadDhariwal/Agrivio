import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AlertsPayload, NotificationItem } from '../models/alerts.models';

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

  listNotifications(): Observable<{ items: NotificationItem[]; summaries: AlertsPayload['summaries'] }> {
    return this.http
      .get<{ data: { items: NotificationItem[]; summaries: AlertsPayload['summaries'] } }>(
        `${environment.publicApiBaseUrl}/api/v1/notifications`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
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
