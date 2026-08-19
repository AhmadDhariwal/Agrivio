import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomersPage } from './customers.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CustomerRecord } from '../../models/customers.models';

function makeCustomers(count: number): CustomerRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `customer-${index + 1}`,
    organizationId: 'org-1',
    name: `Customer ${index + 1}`,
    customerType: 'individual',
    priceTier: 'retail',
    status: 'active',
    version: 1,
    phone: '',
    creditEnabled: false,
    creditLimit: { amount: '0.00', currency: 'PKR' },
    creditLimitBehaviour: 'warning',
    derivedBalances: {
      receivable: { amount: '0.00', currency: 'PKR' },
      advance: { amount: '0.00', currency: 'PKR' },
    },
  }));
}

describe('CustomersPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomersPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () =>
              of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
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
    const fixture: ComponentFixture<CustomersPage> = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No customers yet');
  });

  it('requests the selected page size and renders only the returned page', () => {
    const requests: Array<{ page?: number; pageSize?: number }> = [];
    TestBed.overrideProvider(CustomersApi, {
      useValue: {
        listCustomers: (query: { page?: number; pageSize?: number }) => {
          requests.push(query);
          const pageSize = query.pageSize ?? 25;
          const page = query.page ?? 1;
          const total = 37;
          const start = (page - 1) * pageSize;
          const items = makeCustomers(Math.min(pageSize, Math.max(0, total - start)));
          return of({ items, meta: { page, pageSize, total } });
        },
      },
    });

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();
    expect(requests[0]).toEqual({ page: 1, pageSize: 25, status: 'active', search: '' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="customer-row"]').length).toBe(25);

    const page = fixture.componentInstance;
    page.onPageSizeChange(10);
    fixture.detectChanges();

    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 10, status: 'active', search: '' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="customer-row"]').length).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 37');
  });
});
