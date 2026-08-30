import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BillingEvidencePage } from './billing-evidence.page';
import { environment } from '../../../../../environments/environment';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import {
  API_AUTH_CSRF_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';

describe('BillingEvidencePage', () => {
  let fixture: ComponentFixture<BillingEvidencePage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillingEvidencePage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => ({
              user: { id: 'owner-1' },
              subscriptionAccessState: { status: 'grace', graceEndsAt: '2026-08-15T00:00:00.000Z' },
              activeContext: { organizationId: 'org-1' },
            }),
            activeContext: () => ({ organizationId: 'org-1' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingEvidencePage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_PLANS_PATH}`)
      .flush({
        data: {
          items: [
            {
              id: 'plan-business',
              planCode: 'Business',
              planVersion: 2,
              status: 'active',
              currency: 'PKR',
              monthlyPriceMinorUnits: null,
              annualPriceMinorUnits: null,
              annualDiscountPercent: null,
              limits: {},
              entitlements: {},
            },
          ],
        },
        requestId: 'test',
      });
    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`)
      .flush({ data: { items: [] }, requestId: 'test' });
    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_PATH}`)
      .flush({ data: { status: 'grace', planCode: 'Starter' }, requestId: 'test' });
  });

  it('submits the selected active plan version after a server-issued evidence upload', () => {
    const page = fixture.componentInstance;
    page.form.patchValue({
      requestedPlanId: 'plan-business',
      paymentMethod: 'easypaisa',
      billingPeriod: 'monthly',
      submittedAmountMinorUnits: 1500,
      paymentReference: 'EP-55',
    });
    page.uploadedEvidence.set({
      evidenceStorageRef: 'evidence://org-1/abc',
      originalFileName: 'slip.pdf',
      contentType: 'application/pdf',
      size: 120,
      checksum: 'abc',
      uploadedAt: '2026-08-30T00:00:00.000Z',
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}${API_AUTH_CSRF_PATH}`);
    csrf.flush({ data: { csrfToken: 'csrf-billing' }, requestId: 'test' });

    const submit = http.expectOne(
      (request) =>
        request.url === `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}` &&
        request.method === 'POST',
    );
    expect(submit.request.headers.get('X-CSRF-Token')).toBe('csrf-billing');
    expect(submit.request.body.evidenceStorageRef).toBe('evidence://org-1/abc');
    expect(submit.request.body.requestedPlanCode).toBe('Business');
    expect(submit.request.body.requestedPlanVersion).toBe(2);
    expect(submit.request.body.billingPeriod).toBe('monthly');
    expect(submit.request.body.submittedAmountMinorUnits).toBe(1500);
    submit.flush({
      data: {
        id: 'bill-1',
        organizationId: 'org-1',
        status: 'submitted',
        paymentMethod: 'easypaisa',
        billingPeriod: 'monthly',
        submittedAmountMinorUnits: 1500,
        paymentReferenceNormalized: 'EP-55',
        paymentReferenceDuplicateWarning: false,
        requestedPlanCode: 'Business',
        requestedPlanVersion: 2,
        version: 1,
      },
      requestId: 'test',
    });

    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`)
      .flush({ data: { items: [] }, requestId: 'test' });

    expect(page.successMessage()).toContain('submitted');
    expect(page.uploadedEvidence()).toBeNull();
  });

  it('does not POST when the form is invalid', () => {
    const page = fixture.componentInstance;
    page.form.patchValue({
      submittedAmountMinorUnits: 0,
      paymentReference: '',
    });
    page.submit();
    http.expectNone((request) => request.method === 'POST');
  });

  it('disables submit while invalid and preserves evidence after a failed submit', () => {
    const page = fixture.componentInstance;
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const evidence = {
      evidenceStorageRef: 'evidence://org-1/abc',
      originalFileName: 'slip.pdf',
      contentType: 'application/pdf',
      size: 120,
      checksum: 'abc',
      uploadedAt: '2026-08-30T00:00:00.000Z',
    };
    page.form.patchValue({
      requestedPlanId: 'plan-business',
      paymentMethod: 'easypaisa',
      billingPeriod: 'monthly',
      submittedAmountMinorUnits: 1500,
      paymentReference: 'EP-55',
    });
    page.uploadedEvidence.set(evidence);
    fixture.detectChanges();
    expect(button.disabled).toBe(false);

    page.submit();
    http.expectOne(`${environment.publicApiBaseUrl}${API_AUTH_CSRF_PATH}`).flush({
      data: { csrfToken: 'csrf-billing' },
      requestId: 'test',
    });
    http
      .expectOne(
        (request) =>
          request.url === `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}` &&
          request.method === 'POST',
      )
      .flush({}, { status: 400, statusText: 'Bad Request' });

    expect(page.uploadedEvidence()).toEqual(evidence);
    expect(page.form.controls.paymentReference.value).toBe('EP-55');
    expect(page.submitting()).toBe(false);
  });
});
