import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { SubscriptionApi } from './subscription.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

const submitPayload = {
  paymentMethod: 'bank_transfer' as const,
  billingPeriod: 'monthly' as const,
  submittedAmountMinorUnits: 1,
  paymentReference: 'ref',
  evidenceStorageRef: 'evidence://org-1/file',
  requestedPlanCode: 'Starter',
  requestedPlanVersion: 1,
};

describe('SubscriptionApi cache integration', () => {
  let api: SubscriptionApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
      ],
    });
    api = TestBed.inject(SubscriptionApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('reuses plans as reference and billing reads as short', async () => {
    const plans = firstValueFrom(api.listPlans());
    http
      .expectOne((request) => request.url.endsWith('/subscription/plans'))
      .flush({ data: { items: [] } });
    await plans;
    await firstValueFrom(api.listPlans());

    const records = firstValueFrom(api.listBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { items: [] } });
    await records;
    await firstValueFrom(api.listBillingRecords());

    const detail = firstValueFrom(api.getBillingRecord('bill-1'));
    http
      .expectOne((request) => request.url.endsWith('/subscription/billing-records/bill-1'))
      .flush({ data: { id: 'bill-1' } });
    await detail;
    await firstValueFrom(api.getBillingRecord('bill-1'));

    const queue = firstValueFrom(api.listPlatformBillingRecords({ status: 'submitted' }));
    http
      .expectOne((request) => request.url.endsWith('/platform/billing-records'))
      .flush({ data: { items: [], total: 0, limit: 25, offset: 0 } });
    await queue;
    await firstValueFrom(api.listPlatformBillingRecords({ status: 'submitted' }));

    const platformDetail = firstValueFrom(api.getPlatformBillingRecord('bill-1'));
    http
      .expectOne((request) => request.url.endsWith('/platform/billing-records/bill-1'))
      .flush({ data: { id: 'bill-1' } });
    await platformDetail;
    await firstValueFrom(api.getPlatformBillingRecord('bill-1'));
  });

  it('keeps valid billing cache after failed submit and invalidates owner and platform tags after success', async () => {
    const cached = firstValueFrom(api.listBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { items: [] } });
    await cached;

    const platformCached = firstValueFrom(api.listPlatformBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/platform/billing-records'))
      .flush({ data: { items: [], total: 0, limit: 25, offset: 0 } });
    await platformCached;

    const failed = firstValueFrom(api.submitBillingEvidence(submitPayload));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/subscription/billing-records'))
      .flush({}, { status: 400, statusText: 'Bad Request' });
    await expect(failed).rejects.toBeTruthy();
    await firstValueFrom(api.listBillingRecords());
    await firstValueFrom(api.listPlatformBillingRecords());

    const submitted = firstValueFrom(api.submitBillingEvidence(submitPayload));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { id: 'billing-1' } });
    await submitted;

    const reloadOwner = firstValueFrom(api.listBillingRecords());
    http
      .expectOne(
        (request) =>
          request.method === 'GET' && request.url.endsWith('/subscription/billing-records'),
      )
      .flush({ data: { items: [] } });
    await reloadOwner;

    const reloadPlatform = firstValueFrom(api.listPlatformBillingRecords());
    http
      .expectOne((request) => request.method === 'GET' && request.url.endsWith('/platform/billing-records'))
      .flush({ data: { items: [], total: 0, limit: 25, offset: 0 } });
    await reloadPlatform;
  });

  it('invalidates billing tags after start-review without clearing subscription cache', async () => {
    const subscription = firstValueFrom(api.getSubscription());
    http.expectOne((request) => request.url.endsWith('/subscription')).flush({ data: { status: 'trial' } });
    await subscription;

    const ownerRecords = firstValueFrom(api.listBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { items: [] } });
    await ownerRecords;

    const platformQueue = firstValueFrom(api.listPlatformBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/platform/billing-records'))
      .flush({ data: { items: [], total: 0, limit: 25, offset: 0 } });
    await platformQueue;

    const failed = firstValueFrom(api.startBillingReview('bill-1', 1));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/start-review'))
      .flush({}, { status: 409, statusText: 'Conflict' });
    await expect(failed).rejects.toBeTruthy();
    await firstValueFrom(api.getSubscription());
    await firstValueFrom(api.listBillingRecords());
    await firstValueFrom(api.listPlatformBillingRecords());

    const started = firstValueFrom(api.startBillingReview('bill-1', 1));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/start-review'))
      .flush({ data: { id: 'bill-1', status: 'under_review' } });
    await started;

    await firstValueFrom(api.getSubscription());

    const reloadOwner = firstValueFrom(api.listBillingRecords());
    http
      .expectOne((request) => request.method === 'GET' && request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { items: [] } });
    await reloadOwner;

    const reloadPlatform = firstValueFrom(api.listPlatformBillingRecords());
    http
      .expectOne((request) => request.method === 'GET' && request.url.endsWith('/platform/billing-records'))
      .flush({ data: { items: [], total: 0, limit: 25, offset: 0 } });
    await reloadPlatform;
  });

  it('invalidates subscription after successful approve but not after a failed approve', async () => {
    const subscription = firstValueFrom(api.getSubscription());
    http.expectOne((request) => request.url.endsWith('/subscription')).flush({ data: { status: 'trial' } });
    await subscription;

    const failed = firstValueFrom(api.approveBilling('bill-1', 1));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/approve'))
      .flush({}, { status: 409, statusText: 'Conflict' });
    await expect(failed).rejects.toBeTruthy();
    await firstValueFrom(api.getSubscription());

    const approved = firstValueFrom(api.approveBilling('bill-1', 1));
    http
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/approve'))
      .flush({ data: { id: 'bill-1', status: 'approved' } });
    await approved;

    const reloadSubscription = firstValueFrom(api.getSubscription());
    http
      .expectOne((request) => request.method === 'GET' && request.url.endsWith('/subscription'))
      .flush({ data: { status: 'active' } });
    await reloadSubscription;
  });
});
