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
  ownerStatus?: string;
  ownerNeedsActivation?: boolean;
}

export interface PlatformOrganizationActivationHandoff {
  organizationId: string;
  status: string;
  ownerEmail: string;
  ownerDisplayName: string;
  activationToken: string;
  activationTokenExpiresAt: string;
  activationPath: string;
  activationUrl: string;
  reissued?: boolean;
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
            ...(typeof item['ownerStatus'] === 'string' ? { ownerStatus: item['ownerStatus'] } : {}),
            ...(typeof item['ownerNeedsActivation'] === 'boolean'
              ? { ownerNeedsActivation: item['ownerNeedsActivation'] }
              : {}),
          })),
        ),
      );
  }

  approve(organizationId: string): Observable<PlatformOrganizationActivationHandoff> {
    return this.postActivationAction(organizationId, 'approve');
  }

  reissueActivation(organizationId: string): Observable<PlatformOrganizationActivationHandoff> {
    return this.postActivationAction(organizationId, 'reissue-activation');
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

  private postActivationAction(
    organizationId: string,
    action: 'approve' | 'reissue-activation',
  ): Observable<PlatformOrganizationActivationHandoff> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: Record<string, unknown> }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/organizations/${organizationId}/${action}`,
            {},
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(map((response) => mapActivationHandoff(response.data, organizationId))),
      ),
    );
  }
}

function mapActivationHandoff(
  data: Record<string, unknown>,
  organizationId: string,
): PlatformOrganizationActivationHandoff {
  const activationToken = String(data['activationToken'] ?? '');
  const activationPath =
    typeof data['activationPath'] === 'string' && data['activationPath'].length > 0
      ? data['activationPath']
      : `/activate?token=${encodeURIComponent(activationToken)}`;
  const activationUrl =
    typeof data['activationUrl'] === 'string' && data['activationUrl'].length > 0
      ? data['activationUrl']
      : `${window.location.origin}${activationPath}`;

  return {
    organizationId: String(data['organizationId'] ?? organizationId),
    status: String(data['status'] ?? 'approved'),
    ownerEmail: String(data['ownerEmail'] ?? ''),
    ownerDisplayName: String(data['ownerDisplayName'] ?? ''),
    activationToken,
    activationTokenExpiresAt: String(data['activationTokenExpiresAt'] ?? ''),
    activationPath,
    activationUrl,
    ...(data['reissued'] === true ? { reissued: true } : {}),
  };
}
