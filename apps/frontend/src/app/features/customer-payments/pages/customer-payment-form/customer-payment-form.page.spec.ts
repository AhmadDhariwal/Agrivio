import { describe, expect, it, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerPaymentFormPage } from './customer-payment-form.page';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CustomerPaymentFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerPaymentFormPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomerPaymentsApi,
          useValue: {
            postCustomerPayment: () => of({ allocations: [] }),
            listCustomerLedger: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () =>
              of([{ id: 'cust-1', name: 'Farmer Ali', customerType: 'individual', status: 'active' }]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () =>
              of([{ id: 'acc-1', name: 'Main Cash Account', code: 'CASH-01', accountType: 'cash' }]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('renders payment form with Products-aligned header, eyebrow, and controls', () => {
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('SALES');
    expect(fixture.nativeElement.textContent).toContain('Post customer payment');
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-customer"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-account"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-amount"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-date"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-mode-general"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-mode-invoice"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-save"]')).toBeTruthy();
  });

  it('toggles invoice-specific allocation fields when invoice mode is selected', () => {
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();

    // Default mode is general: invoice section not rendered
    expect(fixture.nativeElement.querySelector('[data-testid="invoice-alloc-section"]')).toBeFalsy();

    // Switch to invoice-specific
    fixture.componentInstance.setAllocationMode('invoice_specific');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="invoice-alloc-section"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-sale-input"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-amount-input"]')).toBeTruthy();
  });

  it('respects capability gating for invoice-specific mode, customer search, and post action', () => {
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    const component = fixture.componentInstance;

    vi.spyOn(component, 'canPostInvoiceSpecific').mockReturnValue(false);
    vi.spyOn(component, 'showCustomerSearch').mockReturnValue(false);
    vi.spyOn(component, 'canPost').mockReturnValue(false);
    fixture.detectChanges();

    // Invoice mode radio should be hidden
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-mode-invoice"]')).toBeFalsy();
    // Customer search input should be hidden
    expect(fixture.nativeElement.querySelector('#customer-payment-customer-search')).toBeFalsy();
    // Post button should be hidden
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-save"]')).toBeFalsy();

    // Attempting to set allocation mode to invoice_specific should be ignored
    component.setAllocationMode('invoice_specific');
    expect(component.isInvoiceSpecific()).toBe(false);
  });
});
