import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerPaymentsPage } from './customer-payments.page';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CustomerPaymentRecord } from '../../models/customer-payments.models';

describe('CustomerPaymentsPage', () => {
  const mockPayment: CustomerPaymentRecord = {
    id: 'pay-123',
    organizationId: 'org-1',
    partyType: 'customer',
    customerId: 'cust-1',
    supplierId: null,
    accountId: 'acc-1',
    allocationMode: 'general',
    amount: { amount: '50000.00', currency: 'PKR' },
    paymentDate: '2026-08-16',
    notes: 'Partial payment against fertilizer ledger dues',
    status: 'posted',
    postedAt: '2026-08-16T10:00:00Z',
    postedBy: 'user-1',
    allocations: [],
  };

  const listCustomerPaymentsSpy = vi.fn().mockReturnValue(
    of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
  );

  beforeEach(async () => {
    listCustomerPaymentsSpy.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    await TestBed.configureTestingModule({
      imports: [CustomerPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomerPaymentsApi,
          useValue: {
            listCustomerPayments: listCustomerPaymentsSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
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
    expect(dateCell?.textContent).toContain('2026-08-16');

    const modeCell = fixture.nativeElement.querySelector('[data-testid="payment-mode"]');
    expect(modeCell?.textContent).toContain('General');

    const amountCell = fixture.nativeElement.querySelector('[data-testid="payment-amount"]');
    expect(amountCell?.textContent).toContain('PKR 50,000.00');

    const mobileList = fixture.nativeElement.querySelector('[data-testid="customer-payments-mobile-list"]');
    expect(mobileList).toBeTruthy();
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
});
