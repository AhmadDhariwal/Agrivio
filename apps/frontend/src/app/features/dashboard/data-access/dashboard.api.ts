import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardPayload } from '../models/dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  getDashboard(): Observable<DashboardPayload> {
    return this.http
      .get<{ data: DashboardPayload }>(`${environment.publicApiBaseUrl}/api/v1/dashboard`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }
}
