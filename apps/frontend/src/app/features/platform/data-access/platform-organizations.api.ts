import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { API_CSRF_HEADER, API_IDEMPOTENCY_KEY_HEADER } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { PaginatedResult, PaginationQuery } from '../../../shared/data-access/pagination';

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

  list(params: PaginationQuery & { status?: string; search?: string } = {}): Observable<PaginatedResult<PlatformOrganizationSummary>> {
    return this.http
      .get<{ data: Array<Record<string, unknown>>; meta: PaginatedResult<PlatformOrganizationSummary>['meta'] }>(
        `${environment.publicApiBaseUrl}/api/v1/platform/organizations`,
        { withCredentials: true, params: { page: params.page ?? 1, pageSize: params.pageSize ?? 25, ...(params.status ? { status: params.status } : {}), ...(params.search ? { search: params.search } : {}) } },
      )
      .pipe(
        map((response) =>
          ({ items: response.data.map((item) => ({
            id: String(item['id'] ?? item['_id'] ?? ''),
            name: String(item['name'] ?? ''),
            status: String(item['status'] ?? ''),
            ...(typeof item['timezone'] === 'string' ? { timezone: item['timezone'] } : {}),
            ...(typeof item['ownerEmail'] === 'string' ? { ownerEmail: item['ownerEmail'] } : {}),
            ...(typeof item['ownerStatus'] === 'string' ? { ownerStatus: item['ownerStatus'] } : {}),
            ...(typeof item['ownerNeedsActivation'] === 'boolean'
              ? { ownerNeedsActivation: item['ownerNeedsActivation'] }
              : {}),
          })), meta: response.meta }),
        ),
      );
  }

  create(input: {
    organizationName: string;
    ownerEmail: string;
    ownerDisplayName: string;
    timezone?: string;
  }): Observable<{ organizationId: string; status: string; ownerEmail: string; duplicate: boolean }> {
    const key = crypto.randomUUID();
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{
          data: {
            organizationId: string;
            status: string;
            ownerEmail: string;
            duplicate?: boolean;
          };
        }>(`${environment.publicApiBaseUrl}/api/v1/platform/organizations`, input, {
          withCredentials: true,
          headers: {
            [API_CSRF_HEADER]: csrfToken,
            [API_IDEMPOTENCY_KEY_HEADER]: key,
          },
        }),
      ),
      map((response) => ({
        organizationId: response.data.organizationId,
        status: response.data.status,
        ownerEmail: response.data.ownerEmail,
        duplicate: response.data.duplicate === true,
      })),
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
