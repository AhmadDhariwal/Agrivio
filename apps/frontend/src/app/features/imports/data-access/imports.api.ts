import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, map, switchMap } from 'rxjs';
import {
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_IMPORTS_PATH,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { ImportJob, ImportRowError, ImportTemplate } from '../models/imports.models';

@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_IMPORTS_PATH}`;

  listTemplates(): Observable<ImportTemplate[]> {
    return this.http
      .get<{ data: { items: ImportTemplate[] } }>(`${this.baseUrl}/templates`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
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
    );
  }

  listErrors(jobId: string): Observable<ImportRowError[]> {
    return this.http
      .get<{ data: { items: ImportRowError[] } }>(`${this.baseUrl}/${jobId}/errors`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.items));
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
    );
  }
}
