import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  BillingEvidencePage,
  displayPkrToMinorUnits,
  minorUnitsToDisplayPkr,
} from './billing-evidence.page';
import { environment } from '../../../../../environments/environment';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import {
  API_AUTH_CSRF_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';

interface MockSessionState {
  user: { id: string };
  subscriptionAccessState: { status: string; graceEndsAt?: string };
  activeContext: { organizationId: string };
  permissions: string[];
}

describe('BillingEvidencePage', () => {
  let fixture: ComponentFixture<BillingEvidencePage>;
  let http: HttpTestingController;
  let mockSessionState: MockSessionState;
  let sessionSignal: WritableSignal<MockSessionState>;
  let capabilitiesSignal: WritableSignal<Record<string, boolean>>;
  let fieldEditableSignal: WritableSignal<Record<string, boolean>>;

  beforeEach(async () => {
    mockSessionState = {
      user: { id: 'owner-1' },
      subscriptionAccessState: { status: 'grace', graceEndsAt: '2026-08-15T00:00:00.000Z' },
      activeContext: { organizationId: 'org-1' },
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    };
    sessionSignal = signal<MockSessionState>(mockSessionState);
    capabilitiesSignal = signal<Record<string, boolean>>({});
    fieldEditableSignal = signal<Record<string, boolean>>({});

    await TestBed.configureTestingModule({
      imports: [BillingEvidencePage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: {
            session: () => sessionSignal(),
            activeContext: () => ({ organizationId: 'org-1' }),
            hasPermission: (perm: string) => sessionSignal().permissions.includes(perm),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => capabilitiesSignal()[key] ?? true,
            canUseFeature: (key: string) => capabilitiesSignal()[key] ?? true,
            canPerformAction: (key: string) => capabilitiesSignal()[key] ?? true,
            canViewField: (key: string) => capabilitiesSignal()[key] ?? true,
            canEditField: (key: string) => fieldEditableSignal()[key] ?? true,
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
              monthlyPriceMinorUnits: 15000000,
              annualPriceMinorUnits: 150000000,
              annualDiscountPercent: 16,
              limits: { products: 10000, activeUsers: 5 },
              entitlements: { imports: true, reportsExports: true },
            },
            {
              id: 'plan-enterprise',
              planCode: 'Enterprise',
              planVersion: 1,
              status: 'active',
              currency: 'PKR',
              monthlyPriceMinorUnits: 35000000,
              annualPriceMinorUnits: 350000000,
              annualDiscountPercent: 20,
              limits: { products: 50000, activeUsers: 20 },
              entitlements: { imports: true, reportsExports: true },
            },
          ],
        },
        requestId: 'test',
      });

    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`)
      .flush({
        data: {
          items: [
            {
              id: 'bill-1',
              organizationId: 'org-1',
              requestedPlanCode: 'Business',
              requestedPlanVersion: 2,
              requestedPlanId: 'plan-business',
              billingPeriod: 'monthly',
              submittedAmountMinorUnits: 15000000,
              currency: 'PKR',
              paymentMethod: 'bank_transfer',
              paymentReferenceNormalized: 'NBP-FT-2025-05-00125',
              paymentReferenceDuplicateWarning: false,
              status: 'submitted',
              submittedAt: '2026-05-28T10:24:00.000Z',
              reviewedAt: null,
              reviewedBy: null,
              rejectionReason: null,
              appliedAt: null,
              appliedSubscriptionId: null,
              coverageStart: null,
              coverageEnd: null,
              notes: 'Payment renewal',
              listedMonthlyPriceMinorUnits: 15000000,
              listedAnnualPriceMinorUnits: null,
              listedAnnualDiscountPercent: null,
              version: 1,
              evidenceOriginalFileName: 'receipt-may-28.pdf',
              evidenceContentType: 'application/pdf',
              evidenceSize: 250880,
            },
            {
              id: 'bill-2',
              organizationId: 'org-1',
              requestedPlanCode: 'Business',
              requestedPlanVersion: 1,
              requestedPlanId: 'plan-business',
              billingPeriod: 'monthly',
              submittedAmountMinorUnits: 15000000,
              currency: 'PKR',
              paymentMethod: 'bank_transfer',
              paymentReferenceNormalized: 'NBP-FT-2025-04-00101',
              paymentReferenceDuplicateWarning: false,
              status: 'rejected',
              submittedAt: '2026-04-28T09:15:00.000Z',
              reviewedAt: '2026-04-28T14:30:00.000Z',
              reviewedBy: 'Super Admin',
              rejectionReason: 'Invalid transaction reference. Bank receipt illegible.',
              appliedAt: null,
              appliedSubscriptionId: null,
              coverageStart: null,
              coverageEnd: null,
              notes: null,
              listedMonthlyPriceMinorUnits: 15000000,
              listedAnnualPriceMinorUnits: null,
              listedAnnualDiscountPercent: null,
              version: 2,
              evidenceOriginalFileName: 'receipt-apr-28.png',
              evidenceContentType: 'image/png',
              evidenceSize: 194560,
            },
          ],
        },
        requestId: 'test',
      });

    http
      .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_PATH}`)
      .flush({
        data: {
          status: 'grace',
          planCode: 'Business',
          planVersion: 1,
          billingPeriod: 'monthly',
          periodStartsAt: '2026-04-01T00:00:00.000Z',
          periodEndsAt: '2026-05-01T00:00:00.000Z',
          graceEndsAt: '2026-05-15T00:00:00.000Z',
        },
        requestId: 'test',
      });
  });

  describe('Plans rendering & selection', () => {
    it('renders active plans loaded from the API', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const planCards = compiled.querySelectorAll('.plan-card');
      expect(planCards.length).toBe(2);
      expect(compiled.textContent).toContain('Business');
      expect(compiled.textContent).toContain('Enterprise');
    });

    it('clicking choose plan updates requested plan and pre-fills listed amount without making it immutable', () => {
      const page = fixture.componentInstance;
      fixture.detectChanges();

      const enterprisePlan = page.plans().find((p) => p.planCode === 'Enterprise');
      expect(enterprisePlan).toBeDefined();
      if (!enterprisePlan) return;
      page.choosePlan(enterprisePlan);
      fixture.detectChanges();

      expect(page.form.controls.requestedPlanId.value).toBe('plan-enterprise');
      expect(page.form.controls.submittedAmountMinorUnits.value).toBe(35000000);
      expect(page.amountPreviewDisplay()).toBe('PKR 350,000.00');

      // Amount remains editable
      page.form.controls.submittedAmountMinorUnits.setValue(36000000);
      expect(page.form.controls.submittedAmountMinorUnits.value).toBe(36000000);
    });

    it('does not expose manual text inputs for planCode, planVersion, or evidenceStorageRef', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('input[name="requestedPlanCode"]')).toBeNull();
      expect(compiled.querySelector('input[name="requestedPlanVersion"]')).toBeNull();
      expect(compiled.querySelector('input[name="evidenceStorageRef"]')).toBeNull();
      expect(compiled.querySelector('input[formControlName="evidenceStorageRef"]')).toBeNull();
    });

    it('does not display technical version labels (e.g. v1, v2) in the plan cards or subscription highlight', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.plan-card__ver')).toBeNull();
      expect(compiled.querySelector('.version-pill')).toBeNull();
    });
  });

  describe('PKR Amount Conversion (Pure Integer Arithmetic)', () => {
    it('converts minor units to human-readable PKR correctly without floating point errors', () => {
      expect(minorUnitsToDisplayPkr(15000000)).toBe('PKR 150,000.00');
      expect(minorUnitsToDisplayPkr(1500)).toBe('PKR 15.00');
      expect(minorUnitsToDisplayPkr(50)).toBe('PKR 0.50');
      expect(minorUnitsToDisplayPkr(0)).toBe('PKR 0.00');
      expect(minorUnitsToDisplayPkr(null)).toBe('PKR 0.00');
    });

    it('converts user PKR input string to minor units integer without rounding error', () => {
      expect(displayPkrToMinorUnits('150,000.00')).toBe(15000000);
      expect(displayPkrToMinorUnits('150000')).toBe(15000000);
      expect(displayPkrToMinorUnits('15.00')).toBe(1500);
      expect(displayPkrToMinorUnits('PKR 150,000.00')).toBe(15000000);
      expect(displayPkrToMinorUnits('0.50')).toBe(50);
      expect(displayPkrToMinorUnits('invalid')).toBeNull();
      expect(displayPkrToMinorUnits('')).toBeNull();
    });
  });

  describe('Form Validation & Submission', () => {
    it('submits the selected active plan version with server-issued evidenceStorageRef', () => {
      const page = fixture.componentInstance;
      page.form.patchValue({
        requestedPlanId: 'plan-business',
        paymentMethod: 'easypaisa',
        billingPeriod: 'monthly',
        submittedAmountMinorUnits: 15000000,
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
      expect(submit.request.body.submittedAmountMinorUnits).toBe(15000000);
      expect(submit.request.body.paymentReference).toBe('EP-55');

      submit.flush({
        data: {
          id: 'bill-3',
          organizationId: 'org-1',
          status: 'submitted',
          paymentMethod: 'easypaisa',
          billingPeriod: 'monthly',
          submittedAmountMinorUnits: 15000000,
          paymentReferenceNormalized: 'EP-55',
          paymentReferenceDuplicateWarning: false,
          requestedPlanCode: 'Business',
          requestedPlanVersion: 2,
          version: 1,
        },
        requestId: 'test',
      });

      // Reloads history
      http
        .expectOne(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`)
        .flush({ data: { items: [] }, requestId: 'test' });

      expect(page.successMessage()).toContain('submitted');
      expect(page.uploadedEvidence()).toBeNull();
      expect(page.form.controls.paymentReference.value).toBe('');
    });

    it('does not POST when the form is invalid and marks controls as touched', () => {
      const page = fixture.componentInstance;
      page.form.patchValue({
        submittedAmountMinorUnits: 0,
        paymentReference: '',
      });
      page.submit();

      expect(page.formSubmitAttempted()).toBe(true);
      expect(page.errorMessage()).toContain('Please complete all required fields');
      http.expectNone((request) => request.method === 'POST');
    });

    it('blocks submit when evidence is not uploaded', () => {
      const page = fixture.componentInstance;
      page.form.patchValue({
        requestedPlanId: 'plan-business',
        paymentMethod: 'bank_transfer',
        billingPeriod: 'monthly',
        submittedAmountMinorUnits: 15000000,
        paymentReference: 'REF-1234',
      });
      page.uploadedEvidence.set(null);
      page.submit();

      expect(page.errorMessage()).toContain('Upload payment evidence before submitting');
      http.expectNone((request) => request.method === 'POST');
    });

    it('prevents double-submit when submission is in flight', () => {
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
      expect(page.submitting()).toBe(true);

      // Second submit call while submitting
      page.submit();

      // Only one CSRF call initiated
      const csrf = http.expectOne(`${environment.publicApiBaseUrl}${API_AUTH_CSRF_PATH}`);
      csrf.flush({ data: { csrfToken: 'csrf-billing' }, requestId: 'test' });

      // Only one POST call initiated
      http.expectOne(
        (request) =>
          request.url === `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}` &&
          request.method === 'POST',
      );
      http.expectNone(
        (request) =>
          request.url === `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}` &&
          request.method === 'POST',
      );
    });

    it('preserves entered values and evidence after a failed submit', () => {
      const page = fixture.componentInstance;
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
      expect(page.errorMessage()).toContain('Unable to submit billing evidence');
    });
  });

  describe('Evidence upload flow', () => {
    it('validates client-side file type and rejects unsupported files', () => {
      const page = fixture.componentInstance;
      const invalidFile = new File(['text'], 'document.txt', { type: 'text/plain' });
      const event = { target: { files: [invalidFile], value: 'document.txt' } } as unknown as Event;

      page.onFileSelected(event);
      expect(page.uploadError()).toContain('Invalid file type');
      expect(page.uploadedEvidence()).toBeNull();
    });

    it('validates client-side file size and rejects files over 5MB', () => {
      const page = fixture.componentInstance;
      const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });
      const event = { target: { files: [largeFile], value: 'large.pdf' } } as unknown as Event;

      page.onFileSelected(event);
      expect(page.uploadError()).toContain('exceeds 5MB limit');
      expect(page.uploadedEvidence()).toBeNull();
    });

    it('allows replacing or removing uploaded evidence', () => {
      const page = fixture.componentInstance;
      page.uploadedEvidence.set({
        evidenceStorageRef: 'evidence://org-1/old',
        originalFileName: 'old.pdf',
        contentType: 'application/pdf',
        size: 100,
        checksum: '123',
        uploadedAt: '2026-08-30T00:00:00.000Z',
      });

      page.removeEvidence();
      expect(page.uploadedEvidence()).toBeNull();
      expect(page.selectedFileName()).toBeNull();
    });
  });

  describe('Billing History & Inspector', () => {
    it('renders history table with records and status badges', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('NBP-FT-2025-05-00125');
      expect(compiled.textContent).toContain('NBP-FT-2025-04-00101');
      expect(compiled.textContent).toContain('Submitted');
      expect(compiled.textContent).toContain('Rejected');
    });

    it('shows rejection reason when opening the inspector for a rejected record', () => {
      const page = fixture.componentInstance;
      fixture.detectChanges();

      const rejectedItem = page.records().find((r) => r.status === 'rejected');
      expect(rejectedItem).toBeDefined();
      if (!rejectedItem) return;
      page.openInspector(rejectedItem);

      // Lazily loads single record detail for inspector
      http
        .expectOne(
          `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${rejectedItem.id}`,
        )
        .flush({ data: rejectedItem, requestId: 'test' });

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Rejection Details');
      expect(compiled.textContent).toContain('Invalid transaction reference. Bank receipt illegible.');
    });

    it('triggers evidence download and revokes the object URL', () => {
      const page = fixture.componentInstance;
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
        // intentionally empty for mock
      });

      const item = page.records()[0];
      expect(item).toBeDefined();
      if (!item) return;
      page.downloadEvidence(item);

      const req = http.expectOne(
        `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/${item.id}/evidence`,
      );
      req.flush(new Blob(['fake-pdf'], { type: 'application/pdf' }));

      expect(createSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:test');

      createSpy.mockRestore();
      revokeSpy.mockRestore();
    });
  });

  describe('Subscription lifecycle & Suspended access', () => {
    it('displays suspended restorative notice when organization is suspended', () => {
      const page = fixture.componentInstance;
      page.subscriptionDetail.set({
        status: 'suspended',
        planCode: 'Business',
        planVersion: 1,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Subscription Suspended');
      expect(compiled.textContent).toContain(
        'Submitting payment evidence for approval will restore operational access',
      );
    });
  });

  describe('Organization controls & capability gating', () => {
    it('hides billing content and displays disabled alert when billing module is disabled', () => {
      capabilitiesSignal.set({ billing: false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="billing-disabled-alert"]')).not.toBeNull();
      expect(compiled.textContent).toContain('Billing has been disabled for this organization');
      expect(compiled.querySelector('[data-testid="current-subscription-card"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="submit-evidence-btn"]')).toBeNull();
      expect(compiled.querySelector('.plans-section')).toBeNull();
      expect(compiled.querySelector('.history-section')).toBeNull();
    });

    it('hides How It Works card when moduleInfo feature is disabled', () => {
      capabilitiesSignal.set({ 'billing.features.moduleInfo': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="how-it-works-card"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="current-subscription-card"]')).not.toBeNull();
    });

    it('hides Current Subscription card when currentSubscription feature is disabled', () => {
      capabilitiesSignal.set({ 'billing.features.currentSubscription': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="current-subscription-card"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="how-it-works-card"]')).not.toBeNull();
    });

    it('hides entire top-grid when both moduleInfo and currentSubscription are disabled', () => {
      capabilitiesSignal.set({
        'billing.features.moduleInfo': false,
        'billing.features.currentSubscription': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.top-grid')).toBeNull();
    });

    it('hides billing history section when billingHistory feature is disabled', () => {
      capabilitiesSignal.set({ 'billing.features.billingHistory': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.history-section')).toBeNull();
    });

    it('hides notes field and excludes notes from submitted payload when notes field is disabled', () => {
      capabilitiesSignal.set({ 'billing.fields.notes': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="billing-notes-input"]')).toBeNull();

      const page = fixture.componentInstance;
      page.form.patchValue({
        requestedPlanId: 'plan-business',
        billingPeriod: 'monthly',
        paymentMethod: 'bank_transfer',
        paymentReference: 'REF-NOTES-TEST',
        submittedAmountMinorUnits: 15000000,
        notes: 'Secret note that should not be sent',
      });
      page.uploadedEvidence.set({
        evidenceStorageRef: 'ref-test',
        originalFileName: 'slip.png',
        size: 1024,
        contentType: 'image/png',
        checksum: 'sha256-mock',
        uploadedAt: new Date().toISOString(),
      });

      page.submit();

      http.expectOne(`${environment.publicApiBaseUrl}${API_AUTH_CSRF_PATH}`).flush({
        data: { csrfToken: 'mock-csrf' },
        requestId: 'csrf',
      });

      const submitReq = http.expectOne(
        `${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`,
      );
      expect(submitReq.request.body.notes).toBeUndefined();
      submitReq.flush({ data: { id: 'new-bill' }, requestId: 'test' });
    });

    it('makes notes input readonly/disabled when canEditField is false', () => {
      fieldEditableSignal.set({ 'billing.fields.notes': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const notesInput = compiled.querySelector<HTMLTextAreaElement>('#billing-notes');
      expect(notesInput?.getAttribute('disabled')).not.toBeNull();
      expect(notesInput?.getAttribute('readonly')).not.toBeNull();
    });

    it('prevents submission when submit action capability is disabled', () => {
      capabilitiesSignal.set({ 'billing.actions.submit': false });
      fixture.detectChanges();

      const page = fixture.componentInstance;
      expect(page.canSubmitBilling()).toBe(false);

      const compiled = fixture.nativeElement as HTMLElement;
      const submitBtn = compiled.querySelector<HTMLButtonElement>(
        '[data-testid="submit-evidence-btn"]',
      );
      expect(submitBtn?.disabled).toBe(true);

      page.submit();
      http.expectNone(`${environment.publicApiBaseUrl}${API_SUBSCRIPTION_BILLING_RECORDS_PATH}`);
      expect(page.errorMessage()).toContain('unavailable');
    });

    it('replaces file dropzone with disabled banner when uploadEvidence action capability is disabled', () => {
      capabilitiesSignal.set({ 'billing.actions.uploadEvidence': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="upload-disabled-banner"]')).not.toBeNull();
      expect(compiled.querySelector('.upload-dropzone')).toBeNull();
    });

    it('hides evidence download button in table and mobile card when downloadEvidence action is disabled', () => {
      capabilitiesSignal.set({ 'billing.actions.downloadEvidence': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.evidence-download-link')).toBeNull();
      expect(compiled.querySelector('.evidence-name')?.textContent).toContain(
        'receipt-may-28.pdf',
      );
    });

    it('hides inspect action in table and mobile cards when inspectHistory action is disabled', () => {
      capabilitiesSignal.set({ 'billing.actions.inspectHistory': false });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="inspect-billing-btn"]')).toBeNull();
      expect(compiled.querySelector('.col-actions')).toBeNull();
    });

    it('hides retry button when refresh action capability is disabled', () => {
      capabilitiesSignal.set({ 'billing.actions.refresh': false });
      const page = fixture.componentInstance;
      page.plansError.set('Network failure');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.retry-btn')).toBeNull();
    });

    it('enforces RBAC intersection: submit requires both capability AND user permission', () => {
      const page = fixture.componentInstance;

      // Case 1: Capability enabled, permission missing
      capabilitiesSignal.set({ 'billing.actions.submit': true });
      sessionSignal.set({
        ...mockSessionState,
        permissions: ['subscription.view'],
      });
      expect(page.canSubmitBilling()).toBe(false);

      // Case 2: Capability disabled, permission granted
      capabilitiesSignal.set({ 'billing.actions.submit': false });
      sessionSignal.set({
        ...mockSessionState,
        permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
      });
      expect(page.canSubmitBilling()).toBe(false);

      // Case 3: Both capability and permission granted
      capabilitiesSignal.set({ 'billing.actions.submit': true });
      expect(page.canSubmitBilling()).toBe(true);
    });

    it('allows suspended organization to access billing and submit when effective billing capability is enabled', () => {
      const page = fixture.componentInstance;
      page.subscriptionDetail.set({
        status: 'suspended',
        planCode: 'Business',
        planVersion: 1,
      });
      capabilitiesSignal.set({
        billing: true,
        'billing.actions.submit': true,
      });
      sessionSignal.set({
        ...mockSessionState,
        permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
      });
      fixture.detectChanges();

      expect(page.isSuspended()).toBe(true);
      expect(page.isBillingEnabled()).toBe(true);
      expect(page.canSubmitBilling()).toBe(true);

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="billing-disabled-alert"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="submit-evidence-btn"]')).not.toBeNull();
    });
  });
});
