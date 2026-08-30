import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardPayload } from '../models/dashboard.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  private readonly queryCache = inject(QueryCacheService);

  getDashboard(
    query?: {
      fromDate?: string;
      toDate?: string;
      branchId?: string;
      warehouseId?: string;
      forceRefresh?: boolean;
    },
  ): Observable<DashboardPayload> {
    const params: Record<string, string> = {};
    if (query?.fromDate) {
      params['fromDate'] = query.fromDate;
    }
    if (query?.toDate) {
      params['toDate'] = query.toDate;
    }
    if (query?.branchId) {
      params['branchId'] = query.branchId;
    }
    if (query?.warehouseId) {
      params['warehouseId'] = query.warehouseId;
    }
    const cacheKey = this.queryCache.buildKey('dashboard', params);
    return this.queryCache.fetch({
      key: cacheKey,
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.dashboard],
      forceRefresh: query?.forceRefresh === true,
      loader: () =>
        this.http
          .get<{ data: DashboardPayload }>(`${environment.publicApiBaseUrl}/api/v1/dashboard`, {
            withCredentials: true,
            params,
          })
          .pipe(map((response) => response.data)),
    });
  }
}
