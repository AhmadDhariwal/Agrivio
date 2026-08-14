import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { API_CSRF_HEADER, API_REPORTS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ReportCatalogItem, ReportDataset } from '../models/reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_REPORTS_PATH}`;

  listCatalog(): Observable<ReportCatalogItem[]> {
    return this.http
      .get<{ data: { items: ReportCatalogItem[] } }>(this.baseUrl, { withCredentials: true })
      .pipe(map((response) => response.data.items));
  }

  getReport(reportKey: string, filters: Record<string, string>): Observable<ReportDataset> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim() !== '') {
        params[key] = value.trim();
      }
    }
    return this.http
      .get<{ data: ReportDataset }>(`${this.baseUrl}/${reportKey}`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  exportReport(
    reportKey: string,
    format: string,
    filters: Record<string, string>,
  ): Observable<Blob> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim() !== '') {
        cleaned[key] = value.trim();
      }
    }
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post(`${this.baseUrl}/${reportKey}/export`, { format, filters: cleaned }, {
          withCredentials: true,
          headers: { [API_CSRF_HEADER]: csrfToken },
          responseType: 'blob',
        }),
      ),
    );
  }
}
