import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  API_ONBOARDING_REQUEST_PATH,
  API_AUTH_ACTIVATE_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
} from '@agrivio/api-contracts';

export interface OrgRequestPayload {
  orgName: string;
  ownerEmail: string;
  ownerName: string;
  timezone?: string;
}

export interface OrgRequestResponse {
  organizationId: string;
  isNewUser: boolean;
}

export interface ActivatePayload {
  token: string;
  password: string;
}

export interface ActivateResponse {
  userId: string;
}

@Injectable({ providedIn: 'root' })
export class OnboardingApiService {
  private readonly http = inject(HttpClient);

  submitOrgRequest(
    payload: OrgRequestPayload,
    idempotencyKey: string,
  ): Observable<{ data: OrgRequestResponse; requestId: string }> {
    const headers = new HttpHeaders({ [API_IDEMPOTENCY_KEY_HEADER]: idempotencyKey });
    return this.http.post<{ data: OrgRequestResponse; requestId: string }>(
      API_ONBOARDING_REQUEST_PATH,
      payload,
      { headers },
    );
  }

  activateAccount(
    payload: ActivatePayload,
  ): Observable<{ data: ActivateResponse; requestId: string }> {
    return this.http.post<{ data: ActivateResponse; requestId: string }>(
      API_AUTH_ACTIVATE_PATH,
      payload,
    );
  }
}
