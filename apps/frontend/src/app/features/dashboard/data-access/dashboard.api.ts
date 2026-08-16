import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardPayload } from '../models/dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  getDashboard(query?: {
    fromDate?: string;
    toDate?: string;
    branchId?: string;
    warehouseId?: string;
  }): Observable<DashboardPayload> {
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
    return this.http
      .get<{ data: DashboardPayload }>(`${environment.publicApiBaseUrl}/api/v1/dashboard`, {
        withCredentials: true,
        params,
      })
      .pipe(map((response) => response.data));
  }
}
