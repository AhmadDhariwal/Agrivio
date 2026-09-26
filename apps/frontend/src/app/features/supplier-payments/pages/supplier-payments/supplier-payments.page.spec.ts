import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierPaymentsPage } from './supplier-payments.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SupplierPaymentRecord } from '../../models/supplier-payments.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPaymentRecords: SupplierPaymentRecord[] = [
  {
    id: 'pay-0001-abcdef',
    organizationId: 'org-1',
    partyType: 'supplier',
    supplierId: 'sup-1',
    customerId: null,
    accountId: 'acc-1',
    allocationMode: 'general',
    amount: { amount: '60000.00', currency: 'PKR' },
    paymentDate: '2026-08-12',
    notes: 'Supplier payment for insecticide shipment',
    status: 'posted',
    postedAt: '2026-08-12T10:00:00.000Z',
    postedBy: 'user-1',
    allocations: [],
    correctionOfId: null,
    reason: '',
    replacementPaymentId: null,
  },
  {
    id: 'pay-0002-ghijkl',
    organizationId: 'org-1',
    partyType: 'supplier',
    supplierId: 'sup-2',
    customerId: null,
    accountId: 'acc-1',
    allocationMode: 'invoice_specific',
    amount: { amount: '56000.00', currency: 'PKR' },
    paymentDate: '2026-08-11',
    notes: 'Payment for INV-2026-001',
    status: 'posted',
    postedAt: '2026-08-11T10:00:00.000Z',
    postedBy: 'user-1',
    allocations: [],
    correctionOfId: null,
    reason: '',
    replacementPaymentId: null,
  },
];

describe('SupplierPaymentsPage', () => {
  let mockListResult = {
    items: mockPaymentRecords,
    meta: { page: 1, pageSize: 25, total: 2 },
  };
  let mockPermission = true;
  let mockPermissionsMap: Record<string, boolean> = {};
  let disabledCapabilities = new Set<string>();
  const listSupplierPaymentsSpy = vi.fn();
  const correctPaymentSpy = vi.fn();

  beforeEach(async () => {
    mockListResult = {
      items: mockPaymentRecords,
      meta: { page: 1, pageSize: 25, total: 2 },
    };
    mockPermission = true;
    mockPermissionsMap = {};
    disabledCapabilities = new Set<string>();
    listSupplierPaymentsSpy.mockReset();
    listSupplierPaymentsSpy.mockImplementation(() => of(mockListResult));
    correctPaymentSpy.mockReset();
    correctPaymentSpy.mockReturnValue(
      of({
        reversalPayment: { id: 'rev-sup-1', status: 'posted' },
        replacementPayment: null,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [SupplierPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierPayments: listSupplierPaymentsSpy,
            correctPayment: correctPaymentSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm?: string) =>
              perm && perm in mockPermissionsMap
                ? mockPermissionsMap[perm]
                : mockPermission,
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => !disabledCapabilities.has(key),
            canUseFeature: (key: string) => !disabledCapabilities.has(key),
            canPerformAction: (key: string) => !disabledCapabilities.has(key),
            canViewField: (key: string) => !disabledCapabilities.has(key),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders page header, count pill, action buttons, and module info', () => {
    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Supplier payments');
    expect(
      compiled.querySelector('[data-testid="supplier-payments-count-pill"]')?.textContent,
    ).toContain('2 payments');
    expect(compiled.querySelector('[data-testid="supplier-payment-create-link"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-ledger-link"]')).toBeTruthy();
    expect(compiled.querySelector('agrivio-ui-module-info')).toBeTruthy();
  });

  it('renders desktop table rows with formatted payment IDs, dates, and amounts', () => {
    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const table = compiled.querySelector('[data-testid="supplier-payments-table"]');
    expect(table).toBeTruthy();

    const rows = compiled.querySelectorAll('[data-testid="supplier-payment-row"]');
    expect(rows.length).toBe(2);

    expect(rows[0]?.textContent).toContain('SPAY-CDEF');
    expect(rows[0]?.textContent).toContain('12 Aug 2026');
    expect(rows[0]?.textContent).toContain('general');
    expect(rows[0]?.textContent).toContain('60,000.00');
    expect(rows[0]?.textContent).toContain('POSTED');

    expect(rows[1]?.textContent).toContain('SPAY-IJKL');
    expect(rows[1]?.textContent).toContain('11 Aug 2026');
    expect(rows[1]?.textContent).toContain('invoice_specific');
    expect(rows[1]?.textContent).toContain('56,000.00');
  });

  it('renders mobile cards for viewport reflow', () => {
    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const mobileList = compiled.querySelector('[data-testid="supplier-payments-mobile-list"]');
    expect(mobileList).toBeTruthy();

    const mobileCards = compiled.querySelectorAll('[data-testid="supplier-payment-mobile-card"]');
    expect(mobileCards.length).toBe(2);
    expect(mobileCards[0]?.textContent).toContain('SPAY-CDEF');
    expect(mobileCards[0]?.textContent).toContain('60,000.00');
  });

  it('shows empty state when no records returned', () => {
    mockListResult = {
      items: [],
      meta: { page: 1, pageSize: 25, total: 0 },
    };

    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="supplier-payments-empty"]')).toBeTruthy();
    expect(compiled.textContent).toContain('No supplier payments found');
  });

  it('stages an exact payment date and sends only paymentDate when Apply is clicked', () => {
    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listSupplierPaymentsSpy.mockClear();

    component.onPaymentDateInput('2026-08-12');
    expect(component.paymentDate()).toBe('');
    expect(listSupplierPaymentsSpy).not.toHaveBeenCalled();

    const applyBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="supplier-payments-apply-btn"]',
    );
    expect(applyBtn).toBeTruthy();
    applyBtn.click();
    fixture.detectChanges();

    expect(component.paymentDate()).toBe('2026-08-12');
    expect(listSupplierPaymentsSpy).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      forceRefresh: true,
      paymentDate: '2026-08-12',
    });

    component.clearFilters();
    expect(component.paymentDate()).toBe('');
  });

  it('applies an inclusive date range and blocks reversed ranges', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listSupplierPaymentsSpy.mockClear();

    component.setDateMode('range');
    component.onFromDateInput('2026-08-01');
    component.onToDateInput('2026-08-31');

    expect(listSupplierPaymentsSpy).not.toHaveBeenCalled();
    component.applyFilters();

    expect(listSupplierPaymentsSpy).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      forceRefresh: true,
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    });

    listSupplierPaymentsSpy.mockClear();
    component.onFromDateInput('2026-09-10');
    component.onToDateInput('2026-09-01');
    component.applyFilters();
    expect(listSupplierPaymentsSpy).not.toHaveBeenCalled();
    expect(component.filterError()).toContain('From date');
  });

  it('shows permission warning when user lacks view permission', () => {
    mockPermission = false;

    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(
      compiled.querySelector('[data-testid="supplier-payments-permission-alert"]'),
    ).toBeTruthy();
    expect(compiled.textContent).toContain('You do not have permission to view supplier payments.');
  });

  it('applies independent module, feature, field, and action controls', () => {
    disabledCapabilities.add('payments.supplier.features.moduleInfo');
    disabledCapabilities.add('payments.supplier.features.paymentDateFilter');
    disabledCapabilities.add('payments.supplier.fields.notes');
    disabledCapabilities.add('payments.supplier.actions.post');
    disabledCapabilities.add('payments.supplier.actions.viewLedger');

    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('agrivio-ui-module-info')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payments-search-input"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payment-create-link"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-ledger-link"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="payment-action-btn"]')).toBeFalsy();
    expect(compiled.querySelector('.cell-notes')).toBeFalsy();

    disabledCapabilities.add('payments.supplier');
    const moduleDisabledFixture = TestBed.createComponent(SupplierPaymentsPage);
    moduleDisabledFixture.detectChanges();
    expect(moduleDisabledFixture.componentInstance.canView()).toBe(false);
  });

  it('renders View, Reverse, and Correct action buttons for posted supplier payments', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const viewBtn = compiled.querySelector('[data-testid="supplier-payment-view-btn"]');
    const reverseBtn = compiled.querySelector('[data-testid="supplier-payment-reverse-btn"]');
    const correctBtn = compiled.querySelector('[data-testid="supplier-payment-correct-btn"]');

    expect(viewBtn).toBeTruthy();
    expect(reverseBtn).toBeTruthy();
    expect(correctBtn).toBeTruthy();

    const mobileViewBtn = compiled.querySelector('[data-testid="supplier-payment-mobile-view-btn"]');
    const mobileReverseBtn = compiled.querySelector('[data-testid="supplier-payment-mobile-reverse-btn"]');
    const mobileCorrectBtn = compiled.querySelector('[data-testid="supplier-payment-mobile-correct-btn"]');

    expect(mobileViewBtn).toBeTruthy();
    expect(mobileReverseBtn).toBeTruthy();
    expect(mobileCorrectBtn).toBeTruthy();
  });

  it('opens detail dialog when View button is clicked', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const viewBtn = fixture.nativeElement.querySelector(
      '[data-testid="supplier-payment-view-btn"]',
    ) as HTMLButtonElement;
    expect(viewBtn).toBeTruthy();
    viewBtn.click();
    fixture.detectChanges();

    expect(component.detailDialogOpen()).toBe(true);
    expect(component.detailTarget()?.id).toBe('pay-0001-abcdef');
  });

  it('opens correction dialog in reverse mode when Reverse button is clicked', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const reverseBtn = fixture.nativeElement.querySelector(
      '[data-testid="supplier-payment-reverse-btn"]',
    ) as HTMLButtonElement;
    expect(reverseBtn).toBeTruthy();
    reverseBtn.click();
    fixture.detectChanges();

    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('reverse');
    expect(component.correctionTarget()?.id).toBe('pay-0001-abcdef');
  });

  it('opens correction dialog in correct mode when Correct button is clicked', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const correctBtn = fixture.nativeElement.querySelector(
      '[data-testid="supplier-payment-correct-btn"]',
    ) as HTMLButtonElement;
    expect(correctBtn).toBeTruthy();
    correctBtn.click();
    fixture.detectChanges();

    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('correct');
    expect(component.correctionTarget()?.id).toBe('pay-0001-abcdef');
  });

  it('renders Reversal badge and blocks reverse/correct when payment is a reversal', () => {
    const reversalRecord: SupplierPaymentRecord = {
      ...mockPaymentRecords[0]!,
      id: 'pay-rev-sup-1',
      correctionOfId: 'pay-0001-abcdef',
      reason: 'Entered duplicate invoice payment',
    };
    mockListResult = {
      items: [reversalRecord],
      meta: { page: 1, pageSize: 25, total: 1 },
    };

    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="reversal-badge"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-reverse-btn"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payment-correct-btn"]')).toBeFalsy();
  });

  it('renders Corrected badge and blocks reverse/correct when payment was already corrected', () => {
    const correctedRecord: SupplierPaymentRecord = {
      ...mockPaymentRecords[0]!,
      id: 'pay-orig-sup-1',
      reversalPaymentId: 'pay-rev-sup-1',
      replacementPaymentId: 'pay-repl-sup-1',
      correctionStatus: 'corrected',
    };
    mockListResult = {
      items: [correctedRecord],
      meta: { page: 1, pageSize: 25, total: 1 },
    };

    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="corrected-badge"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-reverse-btn"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payment-correct-btn"]')).toBeFalsy();
  });

  it('hides Reverse and Correct buttons when user lacks payments.correct permission or capability', () => {
    mockPermissionsMap['payments.correct'] = false;
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="supplier-payment-view-btn"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-reverse-btn"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payment-correct-btn"]')).toBeFalsy();
  });

  it('executes atomic correction via SupplierPaymentsApi and reloads payments on confirm', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listSupplierPaymentsSpy.mockClear();

    const targetRecord = mockPaymentRecords[0]!;
    component.openCorrectionDialog(targetRecord, 'correct');
    expect(component.correctionDialogOpen()).toBe(true);

    component.onCorrectionConfirmed({
      paymentId: targetRecord.id,
      mode: 'correct',
      reason: 'Incorrect bank account selected',
      replacement: {
        accountId: 'acc-2',
        amount: { amount: '55000.00', currency: 'PKR' },
        paymentDate: '2026-08-12',
        allocationMode: 'general',
        notes: 'Corrected supplier payment',
      },
      idempotencyKey: 'idem-sup-test-1',
    });

    expect(correctPaymentSpy).toHaveBeenCalledWith(
      targetRecord.id,
      {
        reason: 'Incorrect bank account selected',
        replacement: {
          accountId: 'acc-2',
          amount: { amount: '55000.00', currency: 'PKR' },
          paymentDate: '2026-08-12',
          allocationMode: 'general',
          notes: 'Corrected supplier payment',
        },
      },
      'idem-sup-test-1',
    );
    expect(component.correctionDialogOpen()).toBe(false);
    expect(component.correctionSubmitting()).toBe(false);
    expect(listSupplierPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  it('transitions from detail dialog to correction dialog on reverse/correct actions', () => {
    const fixture = TestBed.createComponent(SupplierPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const targetRecord = mockPaymentRecords[0]!;
    component.openDetailDialog(targetRecord);
    expect(component.detailDialogOpen()).toBe(true);

    const target = component.detailTarget();
    expect(target).toBeTruthy();
    if (!target) return;

    component.onDetailReverse(target);
    expect(component.detailDialogOpen()).toBe(false);
    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('reverse');

    component.closeCorrectionDialog();
    expect(component.correctionDialogOpen()).toBe(false);

    component.openDetailDialog(targetRecord);
    component.onDetailCorrect(target);
    expect(component.detailDialogOpen()).toBe(false);
    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('correct');
  });
});
