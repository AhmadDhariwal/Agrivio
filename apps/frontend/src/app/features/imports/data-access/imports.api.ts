import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
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
        this.http.post<{ data: ImportJob }>(`${this.baseUrl}/${jobId}/upload`, file, {
          withCredentials: true,
          headers: {
            [API_CSRF_HEADER]: csrfToken,
            'Content-Type': file.type || 'application/vnd.ms-excel',
            'X-Filename': file.name,
          },
        }),
      ),
      map((response) => response.data),
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
