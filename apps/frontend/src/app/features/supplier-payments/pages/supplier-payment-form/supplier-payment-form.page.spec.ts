import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierPaymentFormPage } from './supplier-payment-form.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { vi } from 'vitest';

describe('SupplierPaymentFormPage', () => {
  let disabledCapabilities = new Set<string>();
  let hiddenFields = new Set<string>();
  let readonlyFields = new Set<string>();
  let postSupplierPayment: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    disabledCapabilities = new Set<string>();
    hiddenFields = new Set<string>();
    readonlyFields = new Set<string>();
    postSupplierPayment = vi.fn(() =>
      of({
        amount: { amount: '10.00', currency: 'PKR' },
        allocations: [],
      }),
    );
    await TestBed.configureTestingModule({
      imports: [SupplierPaymentFormPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            postSupplierPayment,
            listSupplierLedger: () => of([]),
            listUnpaidPurchases: () => of([]),
            reconcileSupplier: () => of(null),
          },
        },
        {
          provide: SuppliersApi,
          useValue: {
            listSuppliers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchSupplierOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => !disabledCapabilities.has(key),
            canPerformAction: (key: string) => !disabledCapabilities.has(key),
            canViewField: (key: string) => !hiddenFields.has(key),
            canEditField: (key: string) => !readonlyFields.has(key),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders payment form', () => {
    const fixture: ComponentFixture<SupplierPaymentFormPage> =
      TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-payment-form"]')).toBeTruthy();
  });

  it('gates invoice allocation and omits read-only notes from posting', () => {
    disabledCapabilities.add('payments.supplier.actions.postInvoiceSpecific');
    readonlyFields.add('payments.supplier.fields.notes');
    const fixture = TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="alloc-mode-invoice"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="alloc-mode-general"]')).toBeTruthy();
    expect(compiled.querySelector<HTMLTextAreaElement>('#supplier-payment-notes')?.readOnly).toBe(true);

    component.form.setValue({
      supplierId: 'supplier-1',
      accountId: 'account-1',
      allocationMode: 'general',
      amount: '10.00',
      paymentDate: '2026-08-27',
      notes: 'Must not be submitted',
    });
    component.save();

    expect(postSupplierPayment).toHaveBeenCalledTimes(1);
    expect(postSupplierPayment.mock.calls[0]?.[0]).not.toHaveProperty('notes');
  });

  it('hides configurable notes while retaining platform-enforced payment fields', () => {
    hiddenFields.add('payments.supplier.fields.notes');
    const fixture = TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('#supplier-payment-notes')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="supplier-payment-supplier"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-account"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-amount"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-date"]')).toBeTruthy();
  });
});
