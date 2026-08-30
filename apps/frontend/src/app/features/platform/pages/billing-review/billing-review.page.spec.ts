import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlatformBillingReviewPage } from './billing-review.page';
import { BillingRecordSummary, SubscriptionApi } from '../../../subscriptions/data-access/subscription.api';
import { PlatformOrganizationsApi } from '../../data-access/platform-organizations.api';

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
  listedMonthlyPriceMinorUnits: null,
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
  let approveCalls: Array<{ id: string; version: number }>;
  let rejectCalls: Array<{ id: string; version: number; reason: string }>;
  let startReviewCalls: Array<{ id: string; version: number }>;

  beforeEach(async () => {
    approveCalls = [];
    rejectCalls = [];
    startReviewCalls = [];
    const subscriptionApi = {
      listPlatformBillingRecords: () =>
        of({ items: [submittedRecord], total: 1, limit: 25, offset: 0 }),
      startBillingReview: (id: string, expectedVersion: number) => {
        startReviewCalls.push({ id, version: expectedVersion });
        return of({ ...submittedRecord, status: 'under_review', version: expectedVersion + 1 });
      },
      approveBilling: (id: string, expectedVersion: number) => {
        approveCalls.push({ id, version: expectedVersion });
        return of({ ...submittedRecord, status: 'approved', version: expectedVersion + 1 });
      },
      rejectBilling: (id: string, expectedVersion: number, reason: string) => {
        rejectCalls.push({ id, version: expectedVersion, reason });
        return of({ ...submittedRecord, status: 'rejected', version: expectedVersion + 1 });
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformBillingReviewPage);
    fixture.detectChanges();
  });

  it('shows organization, plan, amount, evidence, notes, coverage, and duplicate warning', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Billing A');
    expect(html.textContent).toContain('Business v2');
    expect(html.textContent).toContain('9000 PKR paisa');
    expect(html.textContent).toContain('jazzcash');
    expect(html.textContent).toContain('JZ-1001');
    expect(html.textContent).toContain('duplicate payment reference');
    expect(html.textContent).toContain('slip.pdf');
    expect(html.textContent).toContain('evidence://org-1/abc');
    expect(html.textContent).toContain('Paid at the branch');
  });

  it('approves and rejects with expectedVersion', () => {
    const page = fixture.componentInstance;
    page.askApprove(submittedRecord);
    page.runConfirmedAction();
    expect(approveCalls).toEqual([{ id: 'bill-1', version: 3 }]);

    page.setRejectReason(submittedRecord.id, 'Unreadable slip');
    page.askReject(submittedRecord);
    page.runConfirmedAction();
    expect(rejectCalls).toEqual([{ id: 'bill-1', version: 3, reason: 'Unreadable slip' }]);
  });

  it('starts review with expectedVersion', () => {
    const page = fixture.componentInstance;
    page.askStartReview(submittedRecord);
    page.runConfirmedAction();
    expect(startReviewCalls).toEqual([{ id: 'bill-1', version: 3 }]);
  });

  it('requires a row-specific rejection reason and does not share one input', () => {
    const page = fixture.componentInstance;
    const other: BillingRecordSummary = { ...submittedRecord, id: 'bill-2' };
    page.items.set([submittedRecord, other]);
    fixture.detectChanges();
    page.setRejectReason(submittedRecord.id, 'Reason A');
    page.setRejectReason(other.id, 'Reason B');
    expect(page.rejectReason(submittedRecord.id)).toBe('Reason A');
    expect(page.rejectReason(other.id)).toBe('Reason B');

    page.setRejectReason(submittedRecord.id, '');
    page.askReject(submittedRecord);
    expect(rejectCalls).toEqual([]);
    expect(page.errorMessage()).toContain('required');
  });

  it('disables approve and reject while a request is in progress', () => {
    const page = fixture.componentInstance;
    page.actionInProgress.set(true);
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    const buttons = [...html.querySelectorAll('button')].filter((button) =>
      ['Approve', 'Reject', 'Start review'].includes(button.textContent?.trim() ?? ''),
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});
