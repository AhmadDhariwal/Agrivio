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
  },
];

describe('SupplierPaymentsPage', () => {
  let mockListResult = {
    items: mockPaymentRecords,
    meta: { page: 1, pageSize: 25, total: 2 },
  };
  let mockPermission = true;
  let disabledCapabilities = new Set<string>();
  const listSupplierPaymentsSpy = vi.fn();

  beforeEach(async () => {
    mockListResult = {
      items: mockPaymentRecords,
      meta: { page: 1, pageSize: 25, total: 2 },
    };
    mockPermission = true;
    disabledCapabilities = new Set<string>();
    listSupplierPaymentsSpy.mockReset();
    listSupplierPaymentsSpy.mockImplementation(() => of(mockListResult));

    await TestBed.configureTestingModule({
      imports: [SupplierPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierPayments: listSupplierPaymentsSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => mockPermission,
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
    expect(rows[0]?.textContent).toContain('2026-08-12');
    expect(rows[0]?.textContent).toContain('general');
    expect(rows[0]?.textContent).toContain('60,000.00');
    expect(rows[0]?.textContent).toContain('POSTED');

    expect(rows[1]?.textContent).toContain('SPAY-IJKL');
    expect(rows[1]?.textContent).toContain('2026-08-11');
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
});
