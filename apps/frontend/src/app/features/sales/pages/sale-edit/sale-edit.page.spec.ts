import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SaleEditPage } from './sale-edit.page';
import { SalesApi } from '../../data-access/sales.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SaleEditPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            createSale: () => of({}),
            updateSale: () => of({}),
            discardSale: () => of({}),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of([]),
            listPackagingUnits: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of([]),
            listWarehouses: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: { listCustomers: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              permission === 'sales.create' || permission === 'sales.view',
          },
        },
      ],
    }).compileComponents();
  });

  it('renders draft form', () => {
    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-draft-banner"]')).toBeTruthy();
  });
});
