import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';

export interface NavigationPreferencesResponse {
  hiddenItemIds: string[];
  groupOrder: string[];
  itemOrderByGroup: Record<string, string[]>;
}

export interface NavigationPreferencesPayload {
  hiddenItemIds: string[];
  groupOrder: string[];
  itemOrderByGroup: Record<string, string[]>;
}

@Injectable({ providedIn: 'root' })
export class NavigationApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  getPreferences(): Observable<NavigationPreferencesResponse> {
    return this.http
      .get<{ data: NavigationPreferencesResponse }>(
        `${environment.publicApiBaseUrl}/api/v1/auth/navigation-preferences`,
        { withCredentials: true },
      )
      .pipe(map((response) => this.normalize(response.data)));
  }

  updatePreferences(
    payload: NavigationPreferencesPayload,
  ): Observable<NavigationPreferencesResponse> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .put<{ data: NavigationPreferencesResponse }>(
            `${environment.publicApiBaseUrl}/api/v1/auth/navigation-preferences`,
            payload,
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(map((response) => this.normalize(response.data))),
      ),
    );
  }

  private normalize(
    data: Partial<NavigationPreferencesResponse> | undefined,
  ): NavigationPreferencesResponse {
    return {
      hiddenItemIds: data?.hiddenItemIds ?? [],
      groupOrder: data?.groupOrder ?? [],
      itemOrderByGroup: data?.itemOrderByGroup ?? {},
    };
  }
}
