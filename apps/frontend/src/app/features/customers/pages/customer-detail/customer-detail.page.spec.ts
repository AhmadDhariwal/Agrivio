import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerDetailPage } from './customer-detail.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { CustomerRecord } from '../../models/customers.models';

const customer: CustomerRecord = {
  id: 'customer-1',
  organizationId: 'org-1',
  name: 'Punjab Agri Corp',
  customerType: 'corporate',
  priceTier: 'wholesale',
  status: 'active',
  version: 2,
  phone: '042-99200001',
  creditEnabled: true,
  creditLimit: { amount: '100000.00', currency: 'PKR' },
  creditLimitBehaviour: 'warning',
  derivedBalances: {
    receivable: { amount: '25000.00', currency: 'PKR' },
    advance: { amount: '0.00', currency: 'PKR' },
  },
};

describe('CustomerDetailPage', () => {
  it('renders inquiry data without form controls and links Edit to the explicit edit route', async () => {
    const api = { getCustomer: vi.fn().mockReturnValue(of(customer)) };
    await TestBed.configureTestingModule({
      imports: [CustomerDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'customer-1' }) } },
        },
        { provide: CustomersApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
            canUseView: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<CustomerDetailPage> =
      TestBed.createComponent(CustomerDetailPage);
    fixture.detectChanges();

    expect(api.getCustomer).toHaveBeenCalledWith('customer-1');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="customer-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/customers/customer-1/edit');
  });
});
