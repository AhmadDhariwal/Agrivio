import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthApi } from '../../auth/data-access/auth.api';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

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
  private readonly queryCache = inject(QueryCacheService);

  getSubscription(forceRefresh = false): Observable<unknown> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('subscription:detail'),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.subscription],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: unknown }>(`${environment.publicApiBaseUrl}/api/v1/subscription`, {
            withCredentials: true,
          })
          .pipe(map((response) => response.data)),
    });
  }

  listPlans(forceRefresh = false): Observable<SubscriptionPlanSummary[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('subscription:plans'),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.subscriptionPlans],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: SubscriptionPlanSummary[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/subscription/plans`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  listBillingRecords(forceRefresh = false): Observable<BillingRecordSummary[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('subscription:billing-records'),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.billingRecords],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: BillingRecordSummary[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/subscription/billing-records`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.billingRecords)),
          ),
      ),
    );
  }

  listPlatformPlans(forceRefresh = false): Observable<SubscriptionPlanSummary[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:subscription-plans'),
      policy: 'reference',
      tags: [QUERY_CACHE_TAGS.subscriptionPlans],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: SubscriptionPlanSummary[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/subscription-plans`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.subscriptionPlans)),
          ),
      ),
    );
  }

  listPlatformBillingRecords(forceRefresh = false): Observable<BillingRecordSummary[]> {
    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:billing-records'),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.platformBillingRecords],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: { items: BillingRecordSummary[] } }>(
            `${environment.publicApiBaseUrl}/api/v1/platform/billing-records`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBillingReview()),
          ),
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
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBillingReview()),
          ),
      ),
    );
  }

  private invalidateBillingReview(): void {
    this.queryCache.invalidateTags(
      QUERY_CACHE_TAGS.platformBillingRecords,
      QUERY_CACHE_TAGS.billingRecords,
      QUERY_CACHE_TAGS.subscription,
    );
  }
}
