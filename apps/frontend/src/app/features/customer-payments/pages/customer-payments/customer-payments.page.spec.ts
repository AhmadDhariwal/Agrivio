import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerPaymentsPage } from './customer-payments.page';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerPaymentRecord } from '../../models/customer-payments.models';

describe('CustomerPaymentsPage', () => {
  const mockPayment: CustomerPaymentRecord = {
    id: 'pay-123',
    organizationId: 'org-1',
    partyType: 'customer',
    customerId: 'cust-1',
    supplierId: null,
    customer: { id: 'cust-1', name: 'Rashid Farms', phone: '0300-1234567' },
    accountId: 'acc-1',
    allocationMode: 'general',
    appliedTo: 'receivable',
    amount: { amount: '50000.00', currency: 'PKR' },
    paymentDate: '2026-08-16',
    notes: 'Partial payment against fertilizer ledger dues',
    status: 'posted',
    postedAt: '2026-08-16T10:00:00Z',
    postedBy: 'user-1',
    allocations: [],
    correctionOfId: null,
    reason: '',
    replacementPaymentId: null,
  };

  const listCustomerPaymentsSpy = vi.fn().mockReturnValue(
    of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
  );

  const searchCustomerOptionsSpy = vi.fn().mockReturnValue(of([]));

  const correctPaymentSpy = vi.fn().mockReturnValue(
    of({
      reversalPayment: { id: 'rev-1', status: 'posted' },
      replacementPayment: null,
    }),
  );

  let permissionMap: Record<string, boolean> = {};

  beforeEach(async () => {
    permissionMap = {
      'customer-payments.view': true,
      'customer-payments.post': true,
      'customers.view': true,
      'payments.correct': true,
    };
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    searchCustomerOptionsSpy.mockReturnValue(of([]));
    correctPaymentSpy.mockReturnValue(
      of({
        reversalPayment: { id: 'rev-1', status: 'posted' },
        replacementPayment: null,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [CustomerPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomerPaymentsApi,
          useValue: {
            listCustomerPayments: listCustomerPaymentsSpy,
            correctPayment: correctPaymentSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: (perm: string) => permissionMap[perm] ?? true },
        },
        {
          provide: CustomersApi,
          useValue: {
            searchCustomerOptions: searchCustomerOptionsSpy,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders page header, eyebrow, and empty state when no payments exist', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('SALES');
    expect(fixture.nativeElement.textContent).toContain('Customer payments');
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-create-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-empty"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('No customer payments yet');
  });

  it('renders data table, columns, and formatted amounts when payments are returned', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    const countPill = fixture.nativeElement.querySelector('[data-testid="customer-payments-count-pill"]');
    expect(countPill?.textContent).toContain('1 payment');

    const table = fixture.nativeElement.querySelector('[data-testid="customer-payments-table"]');
    expect(table).toBeTruthy();

    const dateCell = fixture.nativeElement.querySelector('[data-testid="payment-date"]');
    expect(dateCell?.textContent).toContain('16 Aug 2026');

    const modeCell = fixture.nativeElement.querySelector('[data-testid="payment-mode"]');
    expect(modeCell?.textContent).toContain('General');

    const customerCell = fixture.nativeElement.querySelector('[data-testid="payment-customer"]');
    expect(customerCell?.textContent).toContain('Rashid Farms');

    const appliedToCell = fixture.nativeElement.querySelector('[data-testid="payment-applied-to"]');
    expect(appliedToCell?.textContent).toContain('Receivable');

    const amountCell = fixture.nativeElement.querySelector('[data-testid="payment-amount"]');
    expect(amountCell?.textContent).toContain('PKR 50,000.00');

    const mobileList = fixture.nativeElement.querySelector('[data-testid="customer-payments-mobile-list"]');
    expect(mobileList).toBeTruthy();
  });

  it('renders customer dropdown filter in toolbar', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    const customerFilter = fixture.nativeElement.querySelector('[data-testid="customer-payments-customer-filter"]');
    expect(customerFilter).toBeTruthy();
  });

  it('renders search and date controls in toolbar', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    const searchInput = fixture.nativeElement.querySelector('[data-testid="customer-payments-search-input"]');
    expect(searchInput).toBeTruthy();

    const dateInput = fixture.nativeElement.querySelector('[data-testid="customer-payments-date-input"]');
    expect(dateInput).toBeTruthy();
  });

  it('respects capability gating for post link, search, date filter, and notes', async () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;

    // Simulate capability disabling
    vi.spyOn(component, 'canPost').mockReturnValue(false);
    vi.spyOn(component, 'showSearch').mockReturnValue(false);
    vi.spyOn(component, 'showPaymentDateFilter').mockReturnValue(false);
    vi.spyOn(component, 'canViewField').mockReturnValue(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-create-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-search-input"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-date-input"]')).toBeFalsy();
  });

  it('renders apply button and date mode toggle buttons', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-apply-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-mode-single"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-mode-range"]')).toBeTruthy();
  });

  it('does not reload with filters until apply button is clicked', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    listCustomerPaymentsSpy.mockClear();

    const searchInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-search-input"]',
    );
    searchInput.value = 'note-1';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const dateInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-date-input"]',
    );
    dateInput.value = '2026-09-05';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(listCustomerPaymentsSpy).not.toHaveBeenCalled();

    const applyBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-apply-btn"]',
    );
    applyBtn.click();
    fixture.detectChanges();

    expect(listCustomerPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'note-1',
        paymentDate: '2026-09-05',
        page: 1,
        forceRefresh: true,
      }),
    );
  });

  it('switches to range mode and applies fromDate and toDate', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    listCustomerPaymentsSpy.mockClear();

    const rangeModeBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-mode-range"]',
    );
    rangeModeBtn.click();
    fixture.detectChanges();

    const fromInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-from-date-input"]',
    );
    const toInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-to-date-input"]',
    );
    expect(fromInput).toBeTruthy();
    expect(toInput).toBeTruthy();

    fromInput.value = '2026-08-01';
    fromInput.dispatchEvent(new Event('input'));
    toInput.value = '2026-08-31';
    toInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(listCustomerPaymentsSpy).not.toHaveBeenCalled();

    const applyBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payments-apply-btn"]',
    );
    applyBtn.click();
    fixture.detectChanges();

    expect(listCustomerPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        page: 1,
        forceRefresh: true,
      }),
    );
  });

  it('does not apply a reversed date range', () => {
    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listCustomerPaymentsSpy.mockClear();

    component.setDateMode('range');
    component.onFromDateInput('2026-09-10');
    component.onToDateInput('2026-09-01');
    component.applyFilters();

    expect(listCustomerPaymentsSpy).not.toHaveBeenCalled();
    expect(component.filterError()).toContain('From date');
  });

  it('applies customerId filter when a customer is selected and apply is clicked', () => {
    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listCustomerPaymentsSpy.mockClear();

    component.onCustomerChange('cust-42');
    component.applyFilters();
    fixture.detectChanges();

    expect(listCustomerPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-42', page: 1 }),
    );
  });

  it('clears customer filter on clearFilters', () => {
    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onCustomerChange('cust-42');
    component.applyFilters();
    listCustomerPaymentsSpy.mockClear();

    component.clearFilters();
    fixture.detectChanges();

    expect(component.customerId()).toBe('');
    expect(component.pendingCustomerId()).toBe('');
    expect(listCustomerPaymentsSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ customerId: 'cust-42' }),
    );
  });

  it('renders customer profile link using correct customer ID and keyboard reachable anchor', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    const profileLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      '[data-testid="customer-profile-link"]',
    );
    expect(profileLink).toBeTruthy();
    expect(profileLink?.getAttribute('href')).toBe('/app/customers/cust-1');
    expect(profileLink?.textContent?.trim()).toBe('Rashid Farms');

    const mobileProfileLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      '[data-testid="customer-profile-mobile-link"]',
    );
    expect(mobileProfileLink).toBeTruthy();
    expect(mobileProfileLink?.getAttribute('href')).toBe('/app/customers/cust-1');
  });

  it('renders plain text for customer name when user lacks customers.view permission', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    vi.spyOn(component, 'canViewCustomers').mockReturnValue(false);
    fixture.detectChanges();

    const profileLink = fixture.nativeElement.querySelector('[data-testid="customer-profile-link"]');
    expect(profileLink).toBeFalsy();

    const customerCell = fixture.nativeElement.querySelector('[data-testid="payment-customer"]');
    expect(customerCell?.textContent).toContain('Rashid Farms');
  });

  it('renders filtered empty state with exact copy when active filters yield zero results', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    component.search.set('unknown');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No customer payments match your filters');
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payments-empty-clear"]')).toBeTruthy();
  });

  it('renders View, Reverse, and Correct action buttons for posted uncorrected payment', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    const viewBtn = fixture.nativeElement.querySelector('[data-testid="customer-payment-view-btn"]');
    const reverseBtn = fixture.nativeElement.querySelector('[data-testid="customer-payment-reverse-btn"]');
    const correctBtn = fixture.nativeElement.querySelector('[data-testid="customer-payment-correct-btn"]');

    expect(viewBtn).toBeTruthy();
    expect(reverseBtn).toBeTruthy();
    expect(correctBtn).toBeTruthy();

    const mobileViewBtn = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-mobile-view-btn"]',
    );
    const mobileReverseBtn = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-mobile-reverse-btn"]',
    );
    const mobileCorrectBtn = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-mobile-correct-btn"]',
    );

    expect(mobileViewBtn).toBeTruthy();
    expect(mobileReverseBtn).toBeTruthy();
    expect(mobileCorrectBtn).toBeTruthy();
  });

  it('opens detail dialog when View button is clicked', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const viewBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-view-btn"]',
    );
    viewBtn.click();
    fixture.detectChanges();

    expect(component.detailDialogOpen()).toBe(true);
    expect(component.detailTarget()?.id).toBe('pay-123');
  });

  it('opens correction dialog in reverse mode when Reverse button is clicked', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const reverseBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-reverse-btn"]',
    );
    reverseBtn.click();
    fixture.detectChanges();

    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('reverse');
    expect(component.correctionTarget()?.id).toBe('pay-123');
  });

  it('opens correction dialog in correct mode when Correct button is clicked', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const correctBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-correct-btn"]',
    );
    correctBtn.click();
    fixture.detectChanges();

    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('correct');
    expect(component.correctionTarget()?.id).toBe('pay-123');
  });

  it('renders Reversal badge and blocks reverse/correct when payment is a reversal', () => {
    const reversalRecord: CustomerPaymentRecord = {
      ...mockPayment,
      id: 'pay-rev-1',
      correctionOfId: 'pay-123',
      reason: 'Entered incorrect customer account',
    };
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [reversalRecord], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="reversal-badge"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-reverse-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-correct-btn"]')).toBeFalsy();
  });

  it('renders Corrected badge and blocks reverse/correct when payment was already corrected', () => {
    const correctedRecord: CustomerPaymentRecord = {
      ...mockPayment,
      id: 'pay-orig-1',
      replacementPaymentId: 'pay-repl-1',
    };
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [correctedRecord], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="corrected-badge"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-reverse-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-correct-btn"]')).toBeFalsy();
  });

  it('hides Reverse and Correct buttons when user lacks payments.correct permission', () => {
    permissionMap['payments.correct'] = false;
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-view-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-reverse-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-correct-btn"]')).toBeFalsy();
  });

  it('executes atomic correction via CustomerPaymentsApi and reloads payments on confirm', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    listCustomerPaymentsSpy.mockClear();

    component.openCorrectionDialog(mockPayment, 'correct');
    expect(component.correctionDialogOpen()).toBe(true);

    component.onCorrectionConfirmed({
      paymentId: 'pay-123',
      mode: 'correct',
      reason: 'Customer requested bank transfer instead',
      replacement: {
        accountId: 'acc-2',
        amount: { amount: '48000.00', currency: 'PKR' },
        paymentDate: '2026-08-16',
        allocationMode: 'general',
        notes: 'Corrected to bank transfer',
      },
      idempotencyKey: 'idem-test-123',
    });

    expect(correctPaymentSpy).toHaveBeenCalledWith(
      'pay-123',
      {
        reason: 'Customer requested bank transfer instead',
        replacement: {
          accountId: 'acc-2',
          amount: { amount: '48000.00', currency: 'PKR' },
          paymentDate: '2026-08-16',
          allocationMode: 'general',
          notes: 'Corrected to bank transfer',
        },
      },
      'idem-test-123',
    );
    expect(component.correctionDialogOpen()).toBe(false);
    expect(component.correctionSubmitting()).toBe(false);
    expect(listCustomerPaymentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  it('transitions from detail dialog to correction dialog on reverse/correct actions', () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [mockPayment], meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomerPaymentsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.openDetailDialog(mockPayment);
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

    component.openDetailDialog(mockPayment);
    component.onDetailCorrect(target);
    expect(component.detailDialogOpen()).toBe(false);
    expect(component.correctionDialogOpen()).toBe(true);
    expect(component.correctionInitialMode()).toBe('correct');
  });
});
