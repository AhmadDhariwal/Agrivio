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
            searchCustomerOptions: () => of([]),
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
    const fixture: ComponentFixture<CustomerPaymentFormPage> =
      TestBed.createComponent(CustomerPaymentFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-payment-form"]')).toBeTruthy();
  });
});
