import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlatformBillingReviewPage } from './billing-review.page';
import { BillingRecordSummary, PlatformBillingRecordDetail, SubscriptionApi } from '../../../subscriptions/data-access/subscription.api';
import { PlatformOrganizationsApi } from '../../data-access/platform-organizations.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

const submittedRecord: BillingRecordSummary = {
  id: 'bill-1',
  organizationId: 'org-1',
  requestedPlanCode: 'Business',
  requestedPlanVersion: 2,
  requestedPlanId: 'plan-1',
  billingPeriod: 'monthly',
  submittedAmountMinorUnits: 9000,
  currency: 'PKR',
  paymentMethod: 'jazzcash',
  paymentReferenceNormalized: 'JZ-1001',
  paymentReferenceDuplicateWarning: true,
  status: 'submitted',
  submittedAt: '2026-08-30T00:00:00.000Z',
  reviewedAt: null,
  reviewedBy: null,
  appliedAt: null,
  appliedSubscriptionId: null,
  coverageStart: null,
  coverageEnd: null,
  notes: 'Paid at the branch',
  listedMonthlyPriceMinorUnits: 9000,
  listedAnnualPriceMinorUnits: null,
  listedAnnualDiscountPercent: null,
  version: 3,
  evidenceStorageRef: 'evidence://org-1/abc',
  evidenceOriginalFileName: 'slip.pdf',
  evidenceContentType: 'application/pdf',
  evidenceSize: 2048,
  evidenceChecksum: 'abc',
  evidenceUploadedAt: '2026-08-30T00:00:00.000Z',
};

describe('PlatformBillingReviewPage', () => {
  let fixture: ComponentFixture<PlatformBillingReviewPage>;
  let page: PlatformBillingReviewPage;
  let listCalls: Array<{ query: unknown; forceRefresh: boolean }>;
  let detailCalls: string[];
  let evidenceCalls: string[];
  let approveCalls: Array<{ id: string; version: number }>;
  let rejectCalls: Array<{ id: string; version: number; reason: string }>;
  let startReviewCalls: Array<{ id: string; version: number }>;
  let hasPermission: (permission: string) => boolean;
  let queueItems: BillingRecordSummary[];

  beforeEach(async () => {
    listCalls = [];
    detailCalls = [];
    evidenceCalls = [];
    approveCalls = [];
    rejectCalls = [];
    startReviewCalls = [];
    hasPermission = () => true;
    queueItems = [submittedRecord];

    const subscriptionApi = {
      listPlatformBillingRecords: (query: unknown, forceRefresh = false) => {
        listCalls.push({ query, forceRefresh });
        return of({ items: queueItems, total: queueItems.length, limit: 25, offset: 0 });
      },
      getPlatformBillingRecord: (id: string) => {
        detailCalls.push(id);
        const detail: PlatformBillingRecordDetail = {
          ...submittedRecord,
          id,
          notes: 'Paid at the branch',
          currentSubscription: {
            id: 'sub-live-1',
            organizationId: 'org-1',
            status: 'active',
            planCode: 'Starter',
            planVersion: 1,
            planId: 'plan-starter',
            billingPeriod: 'monthly',
            trialEndsAt: null,
            graceEndsAt: null,
            periodStartsAt: '2026-08-01T00:00:00.000Z',
            periodEndsAt: '2026-09-01T00:00:00.000Z',
            cancelledAt: null,
            retainedUntil: null,
            version: 2,
          },
          appliedSubscription: null,
        };
        return of(detail);
      },
      downloadPlatformEvidence: (id: string) => {
        evidenceCalls.push(id);
        return of(new Blob(['pdf']));
      },
      startBillingReview: (id: string, expectedVersion: number) => {
        startReviewCalls.push({ id, version: expectedVersion });
        return of({ ...submittedRecord, status: 'under_review', version: expectedVersion + 1 });
      },
      approveBilling: (id: string, expectedVersion: number) => {
        approveCalls.push({ id, version: expectedVersion });
        return of({
          ...submittedRecord,
          status: 'approved',
          version: expectedVersion + 1,
          appliedAt: '2026-08-30T01:00:00.000Z',
          coverageStart: '2026-08-30T01:00:00.000Z',
          coverageEnd: '2026-09-30T01:00:00.000Z',
        });
      },
      rejectBilling: (id: string, expectedVersion: number, reason: string) => {
        rejectCalls.push({ id, version: expectedVersion, reason });
        return of({
          ...submittedRecord,
          status: 'rejected',
          rejectionReason: reason,
          version: expectedVersion + 1,
        });
      },
    };
    const organizationsApi = {
      list: () =>
        of({
          items: [{ id: 'org-1', name: 'Billing A', status: 'approved' }],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingReviewPage],
      providers: [
        { provide: SubscriptionApi, useValue: subscriptionApi },
        { provide: PlatformOrganizationsApi, useValue: organizationsApi },
        { provide: AuthSessionStore, useValue: { hasPermission: (permission: string) => hasPermission(permission) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformBillingReviewPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the queue from the list DTO without per-row detail or storage refs', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Billing review');
    expect(html.textContent).toContain('Billing operations');
    expect(html.textContent).toContain('Billing A');
    expect(html.textContent).toContain('Business v2');
    expect(html.textContent).toContain('Monthly');
    expect(html.textContent).toContain('JazzCash');
    expect(html.textContent).toContain('JZ-1001');
    expect(html.textContent).toContain('Duplicate');
    expect(html.textContent).toContain('Submitted');
    expect(html.textContent).not.toContain('evidence://org-1/abc');
    expect(html.textContent).not.toContain('org-1');
    expect(html.querySelectorAll('.kpi-card').length).toBe(0);
    expect(detailCalls).toEqual([]);
    expect(evidenceCalls).toEqual([]);
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]?.forceRefresh).toBe(false);
  });

  it('sends server-backed filter queries', async () => {
    listCalls.length = 0;
    const status = fixture.nativeElement.querySelector('[data-testid="billing-status-filter"]') as HTMLSelectElement;
    status.value = 'submitted';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(listCalls.at(-1)?.query).toEqual(
      expect.objectContaining({ status: 'submitted', limit: 25, offset: 0 }),
    );

    const org = fixture.nativeElement.querySelector('[data-testid="billing-org-filter"]') as HTMLSelectElement;
    org.value = 'org-1';
    org.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(listCalls.at(-1)?.query).toEqual(expect.objectContaining({ organizationId: 'org-1' }));

    const search = fixture.nativeElement.querySelector('[data-testid="billing-search"]') as HTMLInputElement;
    search.value = 'JZ-1001';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(listCalls.at(-1)?.query).toEqual(expect.objectContaining({ q: 'JZ-1001' }));
  });

  it('loads inspector detail lazily and keeps evidence fetch until View or Download', () => {
    page.openInspector(submittedRecord);
    fixture.detectChanges();
    expect(detailCalls).toEqual(['bill-1']);
    expect(evidenceCalls).toEqual([]);
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('slip.pdf');
    expect(html.textContent).toContain('application/pdf');
    expect(html.textContent).toContain('Paid at the branch');
    expect(html.textContent).toContain('Current subscription');
    expect(html.textContent).toContain('Starter v1');
    expect(html.textContent).toContain('Applied subscription');
    expect(html.textContent).toContain('Not applied');
    expect(html.textContent).toContain('Listed amount');
    expect(html.textContent).not.toContain('evidence://');

    const createObjectURL = vi.fn(() => 'blob:evidence');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    page.downloadEvidence(submittedRecord);
    expect(evidenceCalls).toEqual(['bill-1']);
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('starts review from a compact action without a shared confirm dialog', () => {
    page.startReview(submittedRecord);
    expect(startReviewCalls).toEqual([{ id: 'bill-1', version: 3 }]);
  });

  it('opens an approve confirmation with organization, plan, period, and amount', () => {
    page.askApprove(submittedRecord);
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Approve billing evidence?');
    expect(html.textContent).toContain('Billing A');
    expect(html.textContent).toContain('Business v2');
    expect(html.textContent).toContain('Monthly');
    page.confirmApprove();
    expect(approveCalls).toEqual([{ id: 'bill-1', version: 3 }]);
  });

  it('requires a row-specific rejection reason in a dialog, not a queue textbox', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="billing-reject-reason"]')).toBeNull();

    page.askReject(submittedRecord);
    fixture.detectChanges();
    page.confirmReject();
    expect(rejectCalls).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="billing-reject-reason"]')
        .length,
    ).toBe(1);

    page.rejectReason.set('Unreadable slip');
    page.confirmReject();
    expect(rejectCalls).toEqual([{ id: 'bill-1', version: 3, reason: 'Unreadable slip' }]);
  });

  it('keeps approved and rejected rows inspect-only', () => {
    const approved: BillingRecordSummary = { ...submittedRecord, id: 'bill-2', status: 'approved' };
    const rejected: BillingRecordSummary = { ...submittedRecord, id: 'bill-3', status: 'rejected' };
    page.items.set([approved, rejected]);
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    const labels = [...html.querySelectorAll('[data-testid="billing-review-row"] button')].map(
      (button) => button.getAttribute('aria-label') || button.textContent?.trim(),
    );
    expect(labels.filter((label) => label === 'Inspect').length).toBe(2);
    expect(labels).not.toContain('Approve');
    expect(labels).not.toContain('Reject');
    expect(labels).not.toContain('Start review');
  });

  it('disables mutation actions while a request is in progress', () => {
    page.actionInProgress.set(true);
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    const buttons = [...html.querySelectorAll('button')].filter((button) =>
      ['Approve', 'Reject', 'Start Review'].includes(button.textContent?.trim() ?? ''),
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it('refresh issues one forceRefresh list request', () => {
    listCalls.length = 0;
    page.refresh();
    expect(listCalls).toEqual([
      expect.objectContaining({
        forceRefresh: true,
        query: expect.objectContaining({ limit: 25, offset: 0 }),
      }),
    ]);
  });

  it('maps to billing review cards on mobile', () => {
    page.isMobile.set(true);
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="billing-review-cards"]')).not.toBeNull();
    expect(html.querySelector('[data-testid="billing-review-table"]')).toBeNull();
  });

  it('hides unauthorized mutation actions', () => {
    hasPermission = () => false;
    fixture = TestBed.createComponent(PlatformBillingReviewPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('[data-testid="billing-approve"]')).toBeNull();
    expect(html.querySelector('[data-testid="billing-reject"]')).toBeNull();
    expect(html.querySelector('[data-testid="billing-start-review"]')).toBeNull();
    expect(html.querySelector('[data-testid="billing-inspect"]')).toBeNull();
  });

  it('keeps current and applied subscription semantics separate after approval', () => {
    const approvedDetail: PlatformBillingRecordDetail = {
      ...submittedRecord,
      status: 'approved',
      appliedAt: '2026-08-30T01:00:00.000Z',
      coverageStart: '2026-08-30T01:00:00.000Z',
      coverageEnd: '2026-09-30T01:00:00.000Z',
      currentSubscription: {
        id: 'sub-live-1',
        organizationId: 'org-1',
        status: 'active',
        planCode: 'Business',
        planVersion: 2,
        planId: 'plan-1',
        billingPeriod: 'monthly',
        trialEndsAt: null,
        graceEndsAt: null,
        periodStartsAt: '2026-08-30T01:00:00.000Z',
        periodEndsAt: '2026-09-30T01:00:00.000Z',
        cancelledAt: null,
        retainedUntil: null,
        version: 4,
      },
      appliedSubscription: {
        id: 'sub-live-1',
        appliedAt: '2026-08-30T01:00:00.000Z',
        coverageStart: '2026-08-30T01:00:00.000Z',
        coverageEnd: '2026-09-30T01:00:00.000Z',
        planCode: 'Business',
        planVersion: 2,
        billingPeriod: 'monthly',
        status: 'active',
      },
    };

    expect(page.currentSubscriptionLabel(approvedDetail)).toContain('Business v2');
    expect(page.appliedSubscriptionLabel(approvedDetail)).toContain('Business v2');
    expect(page.appliedSubscriptionLabel(approvedDetail)).toContain('30 Aug 2026');
    expect(page.currentSubscriptionLabel(approvedDetail)).not.toContain('Applied');
  });

  it('prevents a second approve while the first request is in flight', () => {
    page.actionInProgress.set(true);
    page.askApprove(submittedRecord);
    page.confirmApprove();
    expect(approveCalls).toEqual([]);
  });
});
