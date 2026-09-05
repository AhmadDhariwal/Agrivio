import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierPaymentFormPage } from './supplier-payment-form.page';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('SupplierPaymentFormPage', () => {
  let disabledCapabilities = new Set<string>();
  let hiddenFields = new Set<string>();
  let readonlyFields = new Set<string>();
  let postSupplierPayment: ReturnType<typeof vi.fn>;

  const mockSuppliers: SupplierRecord[] = [
    {
      id: 'supplier-1',
      organizationId: 'org-1',
      name: 'Engro Fertilizers',
      phone: '03001234567',
      contactName: 'Tariq',
      email: 'tariq@engro.com',
      status: 'active',
      version: 1,
    },
    {
      id: 'supplier-2',
      organizationId: 'org-1',
      name: 'Fauji Fertilizer',
      phone: '03007654321',
      contactName: 'Aslam',
      email: 'aslam@ffc.com',
      status: 'active',
      version: 1,
    },
  ];

  const mockAccounts: AccountRecord[] = [
    {
      id: 'account-1',
      organizationId: 'org-1',
      name: 'HBL Operating',
      accountType: 'bank',
      bankName: 'HBL',
      accountNumberMasked: '****1234',
      walletIdentifier: '',
      status: 'active',
      version: 1,
    },
    {
      id: 'account-2',
      organizationId: 'org-1',
      name: 'Petty Cash',
      accountType: 'cash',
      bankName: '',
      accountNumberMasked: '',
      walletIdentifier: '',
      status: 'active',
      version: 1,
    },
  ];

  const mockUnpaidPurchases = [
    {
      id: 'purchase-1',
      purchaseDate: '2026-08-20',
      dueDate: '2026-09-01',
      sequence: 'PO-2026-001',
      outstanding: { amount: '50000.00', currency: 'PKR' },
      outstandingMinorUnits: '5000000',
    },
  ];

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
            listUnpaidPurchases: () => of(mockUnpaidPurchases),
            reconcileSupplier: () => of(null),
          },
        },
        {
          provide: SuppliersApi,
          useValue: {
            listSuppliers: () => of({ items: mockSuppliers, meta: { page: 1, pageSize: 25, total: 2 } }),
            searchSupplierOptions: () => of(mockSuppliers),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: mockAccounts, meta: { page: 1, pageSize: 25, total: 2 } }),
            listAccountOptions: () => of(mockAccounts),
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
            canUseFeature: (key: string) => !disabledCapabilities.has(key),
            canViewField: (key: string) => !hiddenFields.has(key),
            canEditField: (key: string) => !readonlyFields.has(key),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders payment form with Products-aligned header, 2-column layout, and form controls', () => {
    const fixture: ComponentFixture<SupplierPaymentFormPage> =
      TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="supplier-payment-form"]')).toBeTruthy();
    expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Post supplier payment');
    expect(compiled.querySelector('.page-head__eyebrow')?.textContent).toContain('Purchasing');
    expect(compiled.querySelector('.payment-layout')).toBeTruthy();
    expect(compiled.querySelector('.payment-main-col')).toBeTruthy();
    expect(compiled.querySelector('.payment-side-col')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-supplier-search"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-supplier"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-account"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="alloc-mode-general"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-amount"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="supplier-payment-date"]')).toBeTruthy();
    expect(compiled.querySelector('#supplier-payment-notes')).toBeTruthy();

    // Verify breadcrumbs are omitted matching Products
    expect(compiled.querySelector('.breadcrumb-nav')).toBeFalsy();
    expect(compiled.querySelector('.breadcrumb-list')).toBeFalsy();

    // Verify unsupported "Save as draft" is NOT present
    expect(compiled.textContent).not.toContain('Save as draft');
  });

  it('toggles invoice-specific allocation mode without duplicate amount input', () => {
    const fixture = TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const compiled = fixture.nativeElement as HTMLElement;

    // Initially General mode — invoice section hidden
    expect(compiled.querySelector('[data-testid="invoice-alloc-section"]')).toBeFalsy();

    // Switch to invoice-specific
    component.setAllocationMode('invoice_specific');
    component.form.controls.supplierId.setValue('supplier-1');
    fixture.detectChanges();

    expect(component.isInvoiceSpecific()).toBe(true);
    expect(compiled.querySelector('[data-testid="invoice-alloc-section"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="alloc-purchase-select"]')).toBeTruthy();

    // Verify there is NO duplicate allocation amount field rendered in invoice section
    expect(compiled.querySelector('[data-testid="alloc-amount-input"]')).toBeFalsy();
  });

  it('reactively updates Payment Summary card from form control values', () => {
    const fixture = TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const compiled = fixture.nativeElement as HTMLElement;

    // Initial summary card values
    const summaryEl = compiled.querySelector('.summary-card') as HTMLElement;
    expect(summaryEl.textContent).toContain('Not selected');
    expect(summaryEl.textContent).toContain('General (oldest-first)');
    expect(summaryEl.textContent).toContain('Rs 0.00');

    // Fill form controls
    component.suppliers.set(mockSuppliers);
    component.form.patchValue({
      supplierId: 'supplier-1',
      accountId: 'account-1',
      amount: '75000.00',
      paymentDate: '2026-09-06',
      notes: 'Cheque #12345',
    });
    fixture.detectChanges();

    expect(summaryEl.textContent).toContain('Engro Fertilizers');
    expect(summaryEl.textContent).toContain('HBL Operating');
    expect(summaryEl.textContent).toContain('Rs 75000.00');
    expect(summaryEl.textContent).toContain('2026-09-06');
    expect(summaryEl.textContent).toContain('Cheque #12345');
    expect(compiled.querySelector('.char-counter')?.textContent).toContain('13 / 500');
  });

  it('controls Post Payment button state reactively based on form validity', () => {
    const fixture = TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="supplier-payment-save"]',
    ) as HTMLButtonElement;

    // Initially form is invalid -> button disabled
    expect(component.canSave()).toBe(false);
    expect(saveButton.disabled).toBe(true);

    // Populate all required fields for general mode
    component.form.setValue({
      supplierId: 'supplier-1',
      accountId: 'account-1',
      allocationMode: 'general',
      amount: '5000.00',
      paymentDate: '2026-09-06',
      notes: '',
    });
    fixture.detectChanges();

    expect(component.canSave()).toBe(true);
    expect(saveButton.disabled).toBe(false);

    // In invoice-specific mode, also requires purchase selection
    component.setAllocationMode('invoice_specific');
    fixture.detectChanges();
    expect(component.canSave()).toBe(false);

    component.invoiceAllocationForm.controls.purchaseId.setValue('purchase-1');
    fixture.detectChanges();
    expect(component.canSave()).toBe(true);
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
