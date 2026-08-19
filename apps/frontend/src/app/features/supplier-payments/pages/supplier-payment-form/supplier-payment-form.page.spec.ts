import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierPaymentFormPage } from './supplier-payment-form.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SupplierPaymentFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierPaymentFormPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            postSupplierPayment: () => of({ allocations: [] }),
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
      ],
    }).compileComponents();
  });

  it('renders payment form', () => {
    const fixture: ComponentFixture<SupplierPaymentFormPage> =
      TestBed.createComponent(SupplierPaymentFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-payment-form"]')).toBeTruthy();
  });
});
