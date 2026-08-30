import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

export type SetupStepStatus = 'complete' | 'incomplete' | 'blocked';

export interface SetupStep {
  id: string;
  title: string;
  status: SetupStepStatus;
  href: string;
  permission: string;
}

export interface SetupProgress {
  steps: SetupStep[];
  readyForOperations: boolean;
  notes: string[];
}

@Injectable({ providedIn: 'root' })
export class OrganizationSetupApi {
  private readonly http = inject(HttpClient);
  private readonly queryCache = inject(QueryCacheService);

  getSetupProgress(forceRefresh = false): Observable<SetupProgress> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('organization:setup-progress'),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.setup],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: SetupProgress }>(
            `${environment.publicApiBaseUrl}/api/v1/organization/setup-progress`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data)),
    });
  }
}
