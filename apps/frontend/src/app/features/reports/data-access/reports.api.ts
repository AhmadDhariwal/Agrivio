import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { API_CSRF_HEADER, API_REPORTS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ReportCatalogItem, ReportDataset } from '../models/reports.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_REPORTS_PATH}`;

  listCatalog(options?: { forceRefresh?: boolean }): Observable<ReportCatalogItem[]> {
    const cacheKey = this.queryCache.buildKey('reports-catalog', {});
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.reports],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: { items: ReportCatalogItem[] } }>(this.baseUrl, { withCredentials: true })
          .pipe(map((response) => response.data.items)),
    });
  }

  getReport(
    reportKey: string,
    filters: Record<string, string>,
    options?: { forceRefresh?: boolean },
  ): Observable<ReportDataset> {
    const params: Record<string, string> = { reportKey };
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && value.trim() !== '') {
        params[key] = value.trim();
      }
    }
    const cacheKey = this.queryCache.buildKey('report', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.reports],
      forceRefresh: options?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: ReportDataset }>(`${this.baseUrl}/${reportKey}`, {
            withCredentials: true,
            params: Object.fromEntries(
              Object.entries(params).filter(([key]) => key !== 'reportKey'),
            ),
          })
          .pipe(map((response) => response.data)),
    });
  }

  exportReport(
    reportKey: string,
    format: string,
    filters: Record<string, string>,
  ): Observable<Blob> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && value.trim() !== '') {
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
