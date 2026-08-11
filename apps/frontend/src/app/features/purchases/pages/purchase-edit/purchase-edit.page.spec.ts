import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PurchaseEditPage } from './purchase-edit.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('PurchaseEditPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseEditPage],
      providers: [
        provideRouter([]),
        {
          provide: PurchasesApi,
          useValue: {
            getPurchase: () => of(null),
            createPurchase: () => of({}),
            updatePurchase: () => of({}),
            discardPurchase: () => of({}),
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
          useValue: { listWarehouses: () => of([]) },
        },
        {
          provide: SuppliersApi,
          useValue: { listSuppliers: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('renders draft form', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-draft-banner"]')).toBeTruthy();
  });
});
