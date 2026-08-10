import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

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

  getSetupProgress(): Observable<SetupProgress> {
    return this.http
      .get<{ data: SetupProgress }>(
        `${environment.publicApiBaseUrl}/api/v1/organization/setup-progress`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }
}
