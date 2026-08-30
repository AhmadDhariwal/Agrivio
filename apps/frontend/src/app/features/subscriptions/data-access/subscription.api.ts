import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, from, map, switchMap, tap, catchError, throwError } from 'rxjs';
import {
  API_CSRF_HEADER,
  API_PLATFORM_BILLING_RECORDS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_SUBSCRIPTION_BILLING_EVIDENCE_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
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
  requestedPlanCode: string;
  requestedPlanVersion: number;
  requestedPlanId: string | null;
  billingPeriod: string;
  submittedAmountMinorUnits: number;
  currency: string;
  paymentMethod: string;
  paymentReferenceNormalized: string;
  paymentReferenceDuplicateWarning: boolean;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason?: string | null;
  appliedAt: string | null;
  appliedSubscriptionId: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  notes: string | null;
  listedMonthlyPriceMinorUnits: number | null;
  listedAnnualPriceMinorUnits: number | null;
  listedAnnualDiscountPercent: number | null;
  version: number;
  evidenceStorageRef?: string;
  evidenceOriginalFileName?: string | null;
  evidenceContentType?: string | null;
  evidenceSize?: number | null;
  evidenceChecksum?: string | null;
  evidenceUploadedAt?: string | null;
}

export interface BillingEvidenceUploadResult {
  evidenceStorageRef: string;
  originalFileName: string;
  contentType: string;
  size: number;
  checksum: string;
  uploadedAt: string;
}

export interface BillingSubmitPayload {
  paymentMethod: 'bank_transfer' | 'jazzcash' | 'easypaisa';
  billingPeriod: 'monthly' | 'annual';
  submittedAmountMinorUnits: number;
  paymentReference: string;
  evidenceStorageRef: string;
  requestedPlanCode: string;
  requestedPlanVersion: number;
  notes?: string;
}

export interface PlatformBillingQueue {
  items: BillingRecordSummary[];
  total: number;
  limit: number | null;
  offset: number;
}

export interface PlatformBillingQuery {
  status?: string;
  organizationId?: string;
  q?: string;
  limit?: number;
  offset?: number;
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
          .get<{ data: unknown }>(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_PATH}`, {
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
            `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_PLANS_PATH}`,
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
            `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`,
            { withCredentials: true },
          )
          .pipe(map((response) => response.data.items)),
    });
  }

  uploadBillingEvidence(file: File): Observable<BillingEvidenceUploadResult> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        from(
          fetch(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_EVIDENCE_PATH}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              [API_CSRF_HEADER]: csrfToken,
              'Content-Type': file.type || 'application/octet-stream',
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
            return payload.data as BillingEvidenceUploadResult;
          }),
        ),
      ),
    );
  }

  submitBillingEvidence(payload: BillingSubmitPayload): Observable<BillingRecordSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BillingRecordSummary }>(
            `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`,
            payload,
            {
              withCredentials: true,
              headers: new HttpHeaders({ [API_CSRF_HEADER]: csrfToken }),
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.billingRecords)),
          ),
      ),
    );
  }

  downloadOrganizationEvidence(id: string): Observable<Blob> {
    return this.http.get(
      `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${id}/evidence`,
      { withCredentials: true, responseType: 'blob' },
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
            `${environment.publicApiBaseUrl}${API_PLATFORM_SUBSCRIPTION_PLANS_PATH}`,
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
            `${environment.publicApiBaseUrl}${API_PLATFORM_SUBSCRIPTION_PLANS_PATH}`,
            body,
            {
              withCredentials: true,
              headers: new HttpHeaders({ [API_CSRF_HEADER]: csrfToken }),
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.queryCache.invalidateTags(QUERY_CACHE_TAGS.subscriptionPlans)),
          ),
      ),
    );
  }

  listPlatformBillingRecords(
    query: PlatformBillingQuery = {},
    forceRefresh = false,
  ): Observable<PlatformBillingQueue> {
    let params = new HttpParams();
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.organizationId) {
      params = params.set('organizationId', query.organizationId);
    }
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.limit !== undefined) {
      params = params.set('limit', String(query.limit));
    }
    if (query.offset !== undefined) {
      params = params.set('offset', String(query.offset));
    }

    return this.queryCache.fetch({
      key: this.queryCache.buildKey('platform:billing-records', { ...query }),
      policy: 'short',
      tags: [QUERY_CACHE_TAGS.platformBillingRecords],
      forceRefresh,
      loader: () =>
        this.http
          .get<{ data: PlatformBillingQueue }>(
            `${environment.publicApiBaseUrl}${API_PLATFORM_BILLING_RECORDS_PATH}`,
            { withCredentials: true, params },
          )
          .pipe(
            map((response) => ({
              items: response.data.items ?? [],
              total: response.data.total ?? response.data.items?.length ?? 0,
              limit: response.data.limit ?? null,
              offset: response.data.offset ?? 0,
            })),
          ),
    });
  }

  downloadPlatformEvidence(id: string): Observable<Blob> {
    return this.http.get(
      `${environment.publicApiBaseUrl}${API_PLATFORM_BILLING_RECORDS_PATH}/${id}/evidence`,
      { withCredentials: true, responseType: 'blob' },
    );
  }

  startBillingReview(id: string, expectedVersion: number): Observable<BillingRecordSummary> {
    return this.postPlatformBillingAction(id, 'start-review', { expectedVersion });
  }

  approveBilling(id: string, expectedVersion: number): Observable<BillingRecordSummary> {
    return this.postPlatformBillingAction(id, 'approve', { expectedVersion });
  }

  rejectBilling(
    id: string,
    expectedVersion: number,
    reason: string,
  ): Observable<BillingRecordSummary> {
    return this.postPlatformBillingAction(id, 'reject', { expectedVersion, reason });
  }

  private postPlatformBillingAction(
    id: string,
    action: 'start-review' | 'approve' | 'reject',
    body: Record<string, unknown>,
  ): Observable<BillingRecordSummary> {
    return this.authApi.ensureCsrf().pipe(
      switchMap(({ csrfToken }) =>
        this.http
          .post<{ data: BillingRecordSummary }>(
            `${environment.publicApiBaseUrl}${API_PLATFORM_BILLING_RECORDS_PATH}/${id}/${action}`,
            body,
            {
              withCredentials: true,
              headers: new HttpHeaders({ [API_CSRF_HEADER]: csrfToken }),
            },
          )
          .pipe(
            map((response) => response.data),
            tap(() => this.invalidateBillingReview()),
            catchError((error: unknown) => {
              if (error instanceof HttpErrorResponse && error.status === 409 && action === 'approve') {
                this.invalidateBillingReview();
              }
              return throwError(() => error);
            }),
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
