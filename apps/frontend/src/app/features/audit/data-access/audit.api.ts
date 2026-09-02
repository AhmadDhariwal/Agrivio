import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_AUDIT_EVENTS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuditEventItem } from '../models/audit.models';
import { PaginatedResult } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_AUDIT_EVENTS_PATH}`;

  query(
    filters: Record<string, string | number | undefined | null>,
    forceRefresh = false,
  ): Observable<PaginatedResult<AuditEventItem>> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        params[key] = String(value).trim();
      }
    }
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:list', params),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.audit],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: AuditEventItem[]; meta: PaginatedResult<AuditEventItem>['meta'] }>(
            this.baseUrl,
            { withCredentials: true, params },
          )
          .pipe(map((response) => ({ items: response.data, meta: response.meta }))),
    });
  }

  getById(id: string, forceRefresh = false): Observable<AuditEventItem> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:detail', { id }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.audit],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: AuditEventItem }>(`${this.baseUrl}/${encodeURIComponent(id)}`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }
}
