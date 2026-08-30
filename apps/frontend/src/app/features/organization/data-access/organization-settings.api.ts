import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

export interface OrganizationProfile {
  id: string;
  name: string;
  status: string;
  timezone: string;
  version: number;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  tradingName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  documentFooterNote: string;
  version: number;
}

@Injectable({ providedIn: 'root' })
export class OrganizationSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);

  getOrganization(forceRefresh = false): Observable<OrganizationProfile> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('organization:profile'),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.organization],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: OrganizationProfile }>(
            `${environment.publicApiBaseUrl}/api/v1/organization`,
            {
              withCredentials: true,
            },
          )
          .pipe(map((response) => response.data)),
    });
  }

  updateOrganization(payload: {
    expectedVersion: number;
    name?: string;
    timezone?: string;
  }): Observable<OrganizationProfile> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: OrganizationProfile }>(
            `${environment.publicApiBaseUrl}/api/v1/organization`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(QUERY_CACHE_TAGS.organization, QUERY_CACHE_TAGS.setup),
            ),
          ),
      ),
    );
  }

  getSettings(forceRefresh = false): Observable<OrganizationSettings> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('organization:settings'),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.settings],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: OrganizationSettings }>(`${environment.publicApiBaseUrl}/api/v1/settings`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  updateSettings(payload: {
    expectedVersion: number;
    tradingName?: string;
    contactPhone?: string;
    contactEmail?: string;
    addressLine?: string;
    documentFooterNote?: string;
  }): Observable<OrganizationSettings> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .patch<{ data: OrganizationSettings }>(
            `${environment.publicApiBaseUrl}/api/v1/settings`,
            payload,
            {
              withCredentials: true,
              headers: { 'X-CSRF-Token': csrfToken },
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() =>
              this.queryCache.invalidateTags(QUERY_CACHE_TAGS.settings, QUERY_CACHE_TAGS.setup),
            ),
          ),
      ),
    );
  }
}
