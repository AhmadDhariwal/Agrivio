import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerFormPage } from './customer-form.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CustomerFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerFormPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomersApi,
          useValue: {
            getCustomer: () => of(null),
            createCustomer: () => of({}),
            updateCustomer: () => of({}),
            updateCreditPolicy: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<CustomerFormPage> = TestBed.createComponent(CustomerFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-form"]')).toBeTruthy();
  });
});
