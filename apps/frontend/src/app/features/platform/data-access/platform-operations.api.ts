import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import {
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_PLATFORM_OPERATIONS_BACKUPS_PATH,
  API_PLATFORM_OPERATIONS_RESTORES_PATH,
  API_PLATFORM_AUDIT_RETENTION_PATH,
} from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import {
  AuditRetentionPurgeResult,
  AuditRetentionStatus,
  BackupOperationItem,
  RestoreOperationItem,
} from '../models/operations.models';

@Injectable({ providedIn: 'root' })
export class PlatformOperationsApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly backupsUrl = `${environment.publicApiBaseUrl}${API_PLATFORM_OPERATIONS_BACKUPS_PATH}`;
  private readonly restoresUrl = `${environment.publicApiBaseUrl}${API_PLATFORM_OPERATIONS_RESTORES_PATH}`;
  private readonly auditRetentionUrl = `${environment.publicApiBaseUrl}${API_PLATFORM_AUDIT_RETENTION_PATH}`;

  listBackups(): Observable<BackupOperationItem[]> {
    return this.http
      .get<{ data: { items: BackupOperationItem[] } }>(this.backupsUrl, { withCredentials: true })
      .pipe(map((response) => response.data.items));
  }

  getAuditRetention(
    scope: 'tenant' | 'platform',
    organizationId: string,
  ): Observable<AuditRetentionStatus> {
    const params =
      scope === 'tenant' ? { scope, organizationId: organizationId.trim() } : { scope };
    return this.http
      .get<{ data: AuditRetentionStatus }>(this.auditRetentionUrl, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }

  purgeExpiredAuditRecords(input: {
    scope: 'tenant' | 'platform';
    organizationId: string;
    reason: string;
  }): Observable<AuditRetentionPurgeResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: AuditRetentionPurgeResult }>(
          `${this.auditRetentionUrl}/purge-expired`,
          {
            scope: input.scope,
            ...(input.scope === 'tenant' ? { organizationId: input.organizationId.trim() } : {}),
            reason: input.reason.trim(),
            confirmed: true,
          },
          { withCredentials: true, headers: { [API_CSRF_HEADER]: csrfToken } },
        ),
      ),
      map((response) => response.data),
    );
  }

  initiateRestore(reason: string): Observable<RestoreOperationItem> {
    const key = crypto.randomUUID();
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http.post<{ data: RestoreOperationItem }>(
          this.restoresUrl,
          { reason },
          {
            withCredentials: true,
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              [API_IDEMPOTENCY_KEY_HEADER]: key,
            },
          },
        ),
      ),
      map((response) => response.data),
    );
  }

  getRestore(id: string): Observable<RestoreOperationItem> {
    return this.http
      .get<{ data: RestoreOperationItem }>(`${this.restoresUrl}/${id}`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }
}
