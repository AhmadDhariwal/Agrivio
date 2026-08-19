import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import {
  API_ME_CAPABILITIES_PATH,
  API_PLATFORM_CAPABILITY_REGISTRY_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  CapabilityPolicyChange,
  CapabilityRegistryControl,
  EffectiveCapabilitiesSnapshot,
  PlatformOrganizationCapabilitySnapshot,
} from '../models/capability.models';

@Injectable({ providedIn: 'root' })
export class CapabilitiesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly baseUrl = environment.publicApiBaseUrl;

  getCurrent(): Observable<EffectiveCapabilitiesSnapshot> {
    return this.http
      .get<{ data: EffectiveCapabilitiesSnapshot }>(`${this.baseUrl}${API_ME_CAPABILITIES_PATH}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  getRegistry(): Observable<readonly CapabilityRegistryControl[]> {
    return this.http
      .get<{ data: { controls: readonly CapabilityRegistryControl[] } }>(
        `${this.baseUrl}${API_PLATFORM_CAPABILITY_REGISTRY_PATH}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.controls));
  }

  getOrganizationPolicy(
    organizationId: string,
  ): Observable<PlatformOrganizationCapabilitySnapshot> {
    return this.http
      .get<{ data: PlatformOrganizationCapabilitySnapshot }>(
        `${this.baseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/capabilities`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  updateOrganizationPolicy(
    organizationId: string,
    expectedVersion: number,
    changes: readonly CapabilityPolicyChange[],
    reason?: string,
  ): Observable<unknown> {
    return this.authApi
      .ensureCsrf()
      .pipe(
        switchMap(({ csrfToken }) =>
          this.http.put(
            `${this.baseUrl}${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/capabilities`,
            { expectedVersion, changes, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
            { withCredentials: true, headers: { 'X-CSRF-Token': csrfToken } },
          ),
        ),
      );
  }
}
