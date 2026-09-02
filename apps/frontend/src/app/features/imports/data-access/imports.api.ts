import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, map, switchMap, tap } from 'rxjs';
import {
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_IMPORTS_PATH,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ImportJob, ImportRowError, ImportTemplate } from '../models/imports.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';
import { invalidateImportExecuteEffects } from './imports-cache.invalidation';

@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly queryCache = inject(QueryCacheService);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_IMPORTS_PATH}`;

  listTemplates(forceRefresh = false): Observable<ImportTemplate[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('imports:templates'),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.importTemplates],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: ImportTemplate[] } }>(`${this.baseUrl}/templates`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data.items)),
    });
  }

  downloadTemplate(importType: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/templates/${encodeURIComponent(importType)}`, {
      withCredentials: true,
      responseType: 'blob',
    });
  }

  createJob(importType: string): Observable<ImportJob> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: ImportJob }>(
          this.baseUrl,
          { importType },
          { withCredentials: true, headers: { [API_CSRF_HEADER]: csrfToken } },
        ),
      ),
      map((response) => response.data),
      tap(() => this.invalidateJobReads()),
    );
  }

  upload(jobId: string, file: File): Observable<ImportJob> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        from(
          fetch(`${this.baseUrl}/${jobId}/upload`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              'Content-Type': 'application/octet-stream',
              'X-Filename': file.name,
            },
            body: file,
          }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
              throw new HttpErrorResponse({
                status: response.status,
                error: payload,
                url: response.url,
              });
            }
            return payload.data as ImportJob;
          }),
        ),
      ),
      tap(() => this.invalidateJobReads()),
    );
  }

  validate(jobId: string): Observable<ImportJob> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: ImportJob }>(
          `${this.baseUrl}/${jobId}/validate`,
          {},
          { withCredentials: true, headers: { [API_CSRF_HEADER]: csrfToken } },
        ),
      ),
      map((response) => response.data),
      tap(() => this.invalidateJobReads()),
    );
  }

  getJob(jobId: string, forceRefresh = false): Observable<ImportJob> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('imports:job', { jobId }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.importJobs],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: ImportJob }>(`${this.baseUrl}/${jobId}`, { withCredentials: true })
          .pipe(map((response) => response.data)),
    });
  }

  listErrors(jobId: string, forceRefresh = false): Observable<ImportRowError[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('imports:errors', { jobId }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.importErrors],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: ImportRowError[] } }>(`${this.baseUrl}/${jobId}/errors`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data.items)),
    });
  }

  confirm(jobId: string): Observable<ImportJob> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: ImportJob }>(
          `${this.baseUrl}/${jobId}/confirm`,
          {},
          { withCredentials: true, headers: { [API_CSRF_HEADER]: csrfToken } },
        ),
      ),
      map((response) => response.data),
      tap(() => this.invalidateJobReads()),
    );
  }

  execute(jobId: string, idempotencyKey: string): Observable<ImportJob> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: ImportJob }>(
          `${this.baseUrl}/${jobId}/execute`,
          {},
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              [API_IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
            },
          },
        ),
      ),
      map((response) => response.data),
      tap((job) => invalidateImportExecuteEffects(this.queryCache, job.importType)),
    );
  }

  private invalidateJobReads(): void {
    this.queryCache.invalidateTags(QUERY_CACHE_TAGS.importJobs, QUERY_CACHE_TAGS.importErrors);
  }
}
