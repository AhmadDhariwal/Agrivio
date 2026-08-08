import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApi } from '../auth/auth.api';

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  status: string;
  timezone?: string;
  ownerEmail?: string;
}

export interface PlatformOrganizationApproveResult {
  organizationId: string;
  status: string;
  activationToken: string;
  activationTokenExpiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformOrganizationsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  list(status?: string): Observable<PlatformOrganizationSummary[]> {
    const query = status === undefined || status === '' ? '' : `?status=${encodeURIComponent(status)}`;
    return this.http
      .get<{ data: { items: Array<Record<string, unknown>> } }>(
        `${environment.publicApiBaseUrl}/api/v1/platform/organizations${query}`,
        { withCredentials: true },
      )
      .pipe(
        map((response) =>
          response.data.items.map((item) => ({
            id: String(item['id'] ?? item['_id'] ?? ''),
            name: String(item['name'] ?? ''),
            status: String(item['status'] ?? ''),
            ...(typeof item['timezone'] === 'string' ? { timezone: item['timezone'] } : {}),
            ...(typeof item['ownerEmail'] === 'string' ? { ownerEmail: item['ownerEmail'] } : {}),
          })),
        ),
      );
  }

  approve(organizationId: string): Observable<PlatformOrganizationApproveResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: Record<string, unknown> }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/organizations/${organizationId}/approve`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => ({
              organizationId: String(response.data['organizationId'] ?? organizationId),
              status: String(response.data['status'] ?? 'approved'),
              activationToken: String(response.data['activationToken'] ?? ''),
              activationTokenExpiresAt: String(response.data['activationTokenExpiresAt'] ?? ''),
            })),
          ),
      ),
    );
  }

  reject(organizationId: string, reason: string): Observable<unknown> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(
          `${environment.publicApiBaseUrl}/api/v1/platform/organizations/${organizationId}/reject`,
          { reason },
          {
            withCredentials: true,
            headers: { 'X-CSRF-Token': csrfToken },
          },
        ),
      ),
    );
  }
}
