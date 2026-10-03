import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierDetailPage } from './supplier-detail.page';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import { SupplierRecord } from '../../models/suppliers.models';

const supplier: SupplierRecord = {
  id: 'supplier-1',
  organizationId: 'org-1',
  name: 'BioFert',
  contactName: 'Muhammad Tariq',
  phone: '042-35920001',
  email: 'sales@biofert.pk',
  status: 'active',
  version: 2,
  derivedBalances: {
    payable: { amount: '45000.00', currency: 'PKR' },
    advance: { amount: '0.00', currency: 'PKR' },
  },
};

describe('SupplierDetailPage', () => {
  it('renders inquiry data without form controls and links Edit to the explicit edit route', async () => {
    const api = { getSupplier: vi.fn().mockReturnValue(of(supplier)) };
    await TestBed.configureTestingModule({
      imports: [SupplierDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'supplier-1' }) } },
        },
        { provide: SuppliersApi, useValue: api },
        { provide: AccountsApi, useValue: { listAccountOptions: () => of([]) } },
        { provide: SupplierFinanceApi, useValue: { listRefunds: () => of({ items: [], meta: { total: 0 } }) } },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<SupplierDetailPage> =
      TestBed.createComponent(SupplierDetailPage);
    fixture.detectChanges();

    expect(api.getSupplier).toHaveBeenCalledWith('supplier-1');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="supplier-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/suppliers/supplier-1/edit');
  });
});
