import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { SubscriptionApi } from './subscription.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

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

  it('reuses plans and billing reads using separate policies', async () => {
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
  });

  it('keeps valid billing cache after failed submit and invalidates after success', async () => {
    const payload = {
      paymentMethod: 'bank_transfer' as const,
      billingPeriod: 'monthly' as const,
      submittedAmountMinorUnits: 1,
      paymentReference: 'ref',
      evidenceStorageRef: 'file',
      requestedPlanCode: 'Starter',
      requestedPlanVersion: 1,
    };
    const cached = firstValueFrom(api.listBillingRecords());
    http
      .expectOne((request) => request.url.endsWith('/subscription/billing-records'))
      .flush({ data: { items: [] } });
    await cached;
    const failed = firstValueFrom(api.submitBillingEvidence(payload));
    http
      .expectOne((request) => request.method === 'POST')
      .flush({}, { status: 400, statusText: 'Bad Request' });
    await expect(failed).rejects.toBeTruthy();
    await firstValueFrom(api.listBillingRecords());

    const submitted = firstValueFrom(api.submitBillingEvidence(payload));
    http.expectOne((request) => request.method === 'POST').flush({ data: { id: 'billing-1' } });
    await submitted;
    const reload = firstValueFrom(api.listBillingRecords());
    http
      .expectOne(
        (request) =>
          request.method === 'GET' && request.url.endsWith('/subscription/billing-records'),
      )
      .flush({ data: { items: [] } });
    await reload;
  });
});
