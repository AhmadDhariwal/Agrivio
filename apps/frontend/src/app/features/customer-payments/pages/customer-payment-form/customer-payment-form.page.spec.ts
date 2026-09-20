import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerPaymentFormPage } from './customer-payment-form.page';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
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
            listUnpaidSales: () =>
              of([
                {
                  id: 'sale-1',
                  invoiceNumber: 'INV-001',
                  invoiceDate: '2026-08-01',
                  dueDate: null,
                  sequence: '1',
                  outstanding: { amount: '500.00', currency: 'PKR' },
                  outstandingMinorUnits: '50000',
                },
              ]),
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

    // Switch to invoice-specific with unpaid sales available
    fixture.componentInstance.form.controls.customerId.setValue('cust-1');
    fixture.componentInstance.setAllocationMode('invoice_specific');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="invoice-alloc-section"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="alloc-sale-select"]')).toBeTruthy();
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

  it('renders module info section with title and description', () => {
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('About Posting Customer Payments');
    expect(fixture.nativeElement.textContent).toContain('Record customer money collections');
  });

  it('enables the save button when all required form fields are populated', () => {
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();

    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="customer-payment-save"]',
    );
    expect(saveButton.disabled).toBe(true);

    fixture.componentInstance.form.patchValue({
      customerId: 'cust-1',
      accountId: 'acc-1',
      amount: '5000',
      paymentDate: '2026-09-05',
    });
    fixture.detectChanges();

    expect(saveButton.disabled).toBe(false);
  });

  it('keeps the selected customer label separate from current search results', () => {
    const fixture = TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const selected = { id: 'cust-1', name: 'Farmer Ali', customerType: 'individual', status: 'active' } as CustomerRecord;
    const result = { id: 'cust-2', name: 'Direct Buyer', customerType: 'business', status: 'active' } as CustomerRecord;

    component.customers.set([selected]);
    component.form.controls.customerId.setValue(selected.id);
    component.customers.set([result]);

    expect(component.customerOptions().map((option) => option.value)).toEqual(['cust-2']);
    expect(component.form.controls.customerId.value).toBe('cust-1');
    expect(component.customerSelectedLabel()).toBe('Farmer Ali');
  });

  it('differentiates clearing search text from clearing the selected customer value', () => {
    const fixture = TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const selected = { id: 'cust-1', name: 'Farmer Ali', customerType: 'individual', status: 'active' } as CustomerRecord;
    const result = { id: 'cust-2', name: 'Direct Buyer', customerType: 'business', status: 'active' } as CustomerRecord;

    component.customers.set([selected, result]);
    component.form.controls.allocationMode.setValue('invoice_specific');
    component.form.controls.customerId.setValue(selected.id);
    fixture.detectChanges();

    expect(component.form.controls.customerId.value).toBe('cust-1');
    expect(component.customerSelectedLabel()).toBe('Farmer Ali');
    expect(component.unpaidSales().length).toBeGreaterThan(0);

    // Clearing search text only does NOT clear the selected value or reset dependent state
    component.onCustomerSearch('');
    fixture.detectChanges();

    expect(component.form.controls.customerId.value).toBe('cust-1');
    expect(component.customerSelectedLabel()).toBe('Farmer Ali');
    expect(component.unpaidSales().length).toBeGreaterThan(0);

    // Clearing the selected customer value resets selection and dependent state
    component.form.controls.customerId.setValue('');
    fixture.detectChanges();

    expect(component.form.controls.customerId.value).toBe('');
    expect(component.customerSelectedLabel()).toBe('');
    expect(component.unpaidSales()).toEqual([]);
  });

  it('renders customer ledger preview with humanized titles, date, time, source, and formatted PKR amounts', () => {
    const fixture = TestBed.createComponent(CustomerPaymentFormPage);
    const component = fixture.componentInstance;

    component.ledgerItems.set([
      {
        id: 'effect-1',
        organizationId: 'org-1',
        partyType: 'customer',
        customerId: 'cust-1',
        supplierId: null,
        effectKind: 'advance',
        signedAmount: { amount: '20000.00', currency: 'PKR' },
        currency: 'PKR',
        sourceType: 'customer_payment_advance',
        sourceId: '6a835a6bc5d6f02a711e5d13',
        status: 'posted',
        postedAt: '2026-09-20T15:56:48.000Z',
        postedBy: 'user-1',
      },
      {
        id: 'effect-2',
        organizationId: 'org-1',
        partyType: 'customer',
        customerId: 'cust-1',
        supplierId: null,
        effectKind: 'advance',
        signedAmount: { amount: '-5800.00', currency: 'PKR' },
        currency: 'PKR',
        sourceType: 'customer_advance_consumption',
        sourceId: 'sale-101',
        status: 'posted',
        postedAt: '2026-09-20T15:56:48.000Z',
        postedBy: 'user-1',
      },
    ]);

    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="ledger-row"]');
    expect(rows.length).toBe(2);

    // Row 1: Advance Received
    expect(rows[0].querySelector('.ledger-row__title')?.textContent).toContain('Customer Advance Received');
    expect(rows[0].querySelector('.ledger-row__amount')?.textContent).toContain('+ PKR 20,000');
    expect(rows[0].querySelector('.ledger-row__meta')?.textContent).toContain('Customer Advance');

    // Row 2: Advance Consumed
    expect(rows[1].querySelector('.ledger-row__title')?.textContent).toContain('Advance Consumed');
    expect(rows[1].querySelector('.ledger-row__amount')?.textContent).toContain('- PKR 5,800');
    expect(rows[1].querySelector('.ledger-row__meta')?.textContent).toContain('Advance Consumption');
  });
});
