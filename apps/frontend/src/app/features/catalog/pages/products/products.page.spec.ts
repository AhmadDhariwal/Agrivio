import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductsPage } from './products.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { InventoryApi } from '../../../inventory/data-access/inventory.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ProductsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCategoryOptions: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: InventoryApi,
          useValue: {
            listBalances: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
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
    const fixture: ComponentFixture<ProductsPage> = TestBed.createComponent(ProductsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No products yet');
  });
});


