import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerPaymentsPage } from './customer-payments.page';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CustomerPaymentsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomerPaymentsApi,
          useValue: {
            listCustomerPayments: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<CustomerPaymentsPage> =
      TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No customer payments yet');
  });
});
