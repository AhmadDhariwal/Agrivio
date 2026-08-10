import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BillingEvidencePage } from './billing-evidence.page';
import { environment } from '../../../../../environments/environment';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BillingEvidencePage', () => {
  let fixture: ComponentFixture<BillingEvidencePage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillingEvidencePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => ({
              subscriptionAccessState: { status: 'grace', graceEndsAt: '2026-08-15T00:00:00.000Z' },
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingEvidencePage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http
      .expectOne(`${environment.publicApiBaseUrl}/api/v1/subscription/billing-records`)
      .flush({ data: { items: [] }, requestId: 'test' });
    http
      .expectOne(`${environment.publicApiBaseUrl}/api/v1/subscription`)
      .flush({ data: { status: 'grace', planCode: 'Starter' }, requestId: 'test' });
  });

  it('submits CSRF-protected billing evidence with opaque storage ref', () => {
    const page = fixture.componentInstance;
    page.form.setValue({
      paymentMethod: 'easypaisa',
      billingPeriod: 'monthly',
      submittedAmountMinorUnits: 1500,
      paymentReference: 'EP-55',
      evidenceStorageRef: 'evidence://opaque/abc',
      evidenceOriginalFileName: 'slip.pdf',
      requestedPlanCode: 'Starter',
      requestedPlanVersion: 1,
    });
    page.submit();

    const csrf = http.expectOne(`${environment.publicApiBaseUrl}/api/v1/auth/csrf`);
    csrf.flush({ data: { csrfToken: 'csrf-billing' }, requestId: 'test' });

    const submit = http.expectOne(
      (request) =>
        request.url === `${environment.publicApiBaseUrl}/api/v1/subscription/billing-records` &&
        request.method === 'POST',
    );
    expect(submit.request.headers.get('X-CSRF-Token')).toBe('csrf-billing');
    expect(submit.request.body.evidenceStorageRef).toBe('evidence://opaque/abc');
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
        version: 1,
      },
      requestId: 'test',
    });

    http
      .expectOne(`${environment.publicApiBaseUrl}/api/v1/subscription/billing-records`)
      .flush({ data: { items: [] }, requestId: 'test' });

    expect(page.successMessage()).toContain('submitted');
  });
});
