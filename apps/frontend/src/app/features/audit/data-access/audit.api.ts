import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_AUDIT_EVENTS_PATH } from '@agrivio/api-contracts';
import { environment } from '../../../../environments/environment';
import { AuditEventItem } from '../models/audit.models';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.publicApiBaseUrl}${API_AUDIT_EVENTS_PATH}`;

  query(filters: Record<string, string>): Observable<AuditEventItem[]> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim() !== '') {
        params[key] = value.trim();
      }
    }
    return this.http
      .get<{ data: { items: AuditEventItem[] } }>(this.baseUrl, { withCredentials: true, params })
      .pipe(map((response) => response.data.items));
  }
}
