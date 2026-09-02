import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_AUDIT_EVENTS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuditEventItem, AuditSummary } from '../models/audit.models';
import { PaginatedResult } from '../../../shared/data-access/pagination';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

export type AuditFilterOptionField =
  | 'actorId'
  | 'action'
  | 'resourceType'
  | 'resourceId';


export interface AuditFilterOptions {
  field: AuditFilterOptionField;
  items: string[];
}

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly queryCache = inject(QueryCacheService);
  private readonly sessionStore = inject(AuthSessionStore);
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
    const organizationId = this.sessionStore.activeContext()?.organizationId ?? 'anonymous';
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:list', { ...params, organizationId }),
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
    const organizationId = this.sessionStore.activeContext()?.organizationId ?? 'anonymous';
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:detail', { organizationId, id }),
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

  getFilterOptions(
    field: AuditFilterOptionField,
    search = '',
    limit = 20,
  ): Observable<AuditFilterOptions> {
    const params = {
      field,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
      limit: String(limit),
    };
    const organizationId = this.sessionStore.activeContext()?.organizationId ?? 'anonymous';
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:filter-options', {
        ...params,
        organizationId,
      }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.audit],
      loader: () =>
        this.http
          .get<{ data: AuditFilterOptions }>(`${this.baseUrl}/filter-options`, {
            withCredentials: true,
            params,
          })
          .pipe(map((response) => response.data)),
    });
  }

  getSummary(forceRefresh = false): Observable<AuditSummary> {
    const organizationId = this.sessionStore.activeContext()?.organizationId ?? 'anonymous';
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('audit:summary', { organizationId }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.audit],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: AuditSummary }>(`${this.baseUrl}/summary`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }
}
