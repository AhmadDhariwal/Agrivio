import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';

export interface SubscriptionPlanSummary {
  id: string;
  planCode: string;
  planVersion: number;
  status: string;
  currency: string;
  monthlyPriceMinorUnits: number | null;
  annualPriceMinorUnits: number | null;
  annualDiscountPercent: number | null;
  limits: Record<string, number | null>;
  entitlements: Record<string, unknown>;
}

export interface BillingRecordSummary {
  id: string;
  organizationId: string;
  status: string;
  paymentMethod: string;
  billingPeriod: string;
  submittedAmountMinorUnits: number;
  paymentReferenceNormalized: string;
  paymentReferenceDuplicateWarning: boolean;
  version: number;
  rejectionReason?: string | null;
}

export interface BillingSubmitPayload {
  paymentMethod: 'bank_transfer' | 'jazzcash' | 'easypaisa';
  billingPeriod: 'monthly' | 'annual';
  submittedAmountMinorUnits: number;
  paymentReference: string;
  evidenceStorageRef: string;
  evidenceOriginalFileName?: string;
  requestedPlanCode: string;
  requestedPlanVersion: number;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  getSubscription(): Observable<unknown> {
    return this.http
      .get<{ data: unknown }>(`${environment.publicApiBaseUrl}/api/v1/subscription`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  listPlans(): Observable<SubscriptionPlanSummary[]> {
    return this.http
      .get<{ data: { items: SubscriptionPlanSummary[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/subscription/plans`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  listBillingRecords(): Observable<BillingRecordSummary[]> {
    return this.http
      .get<{ data: { items: BillingRecordSummary[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/subscription/billing-records`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  submitBillingEvidence(payload: BillingSubmitPayload): Observable<BillingRecordSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BillingRecordSummary }>(
            `${environment.publicApiBaseUrl}/api/v1/subscription/billing-records`,
            payload,
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  listPlatformPlans(): Observable<SubscriptionPlanSummary[]> {
    return this.http
      .get<{ data: { items: SubscriptionPlanSummary[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/platform/subscription-plans`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  createPlatformPlan(body: Record<string, unknown>): Observable<SubscriptionPlanSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: SubscriptionPlanSummary }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/subscription-plans`,
            body,
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  listPlatformBillingRecords(): Observable<BillingRecordSummary[]> {
    return this.http
      .get<{ data: { items: BillingRecordSummary[] } }>(
        `${environment.publicApiBaseUrl}/api/v1/platform/billing-records`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.items));
  }

  approveBilling(id: string, expectedVersion: number): Observable<BillingRecordSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BillingRecordSummary }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/billing-records/${id}/approve`,
            { expectedVersion },
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }

  rejectBilling(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Observable<BillingRecordSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BillingRecordSummary }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/billing-records/${id}/reject`,
            { expectedVersion, reason },
            {
              withCredentials: true,
              headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
            },
          )
          .pipe(map((response) => response.data)),
      ),
    );
  }
}
