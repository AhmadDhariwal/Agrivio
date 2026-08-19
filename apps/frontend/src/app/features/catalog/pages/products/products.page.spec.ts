import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductsPage } from './products.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { InventoryApi } from '../../../inventory/data-access/inventory.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ProductsPage', () => {
  let component: ProductsPage;
  let fixture: ComponentFixture<ProductsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({
              items: [
                {
                  id: 'prod-1',
                  name: 'Bio-Enhanced Multi-Element Micronutrient Complex Fertilizer 50kg',
                  sku: 'FERT-MICRO-50',
                  categoryId: 'cat-1',
                  measurementDimension: 'mass',
                  baseUnitCode: 'KG',
                  trackingMode: 'batch_expiry',
                  status: 'active',
                  version: 1,
                },
              ],
              meta: { page: 1, pageSize: 25, total: 1 },
            }),
            searchCategoryOptions: () => of([{ id: 'cat-1', name: 'Fertilizers', productClass: 'fertilizer' }]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([{ id: 'pr-1', productId: 'prod-1', priceTier: 'retail', price: { amount: '5800.00', currency: 'PKR' }, status: 'active', version: 1 }]),
          },
        },
        {
          provide: InventoryApi,
          useValue: {
            listBalances: () => of({
              items: [{ productId: 'prod-1', quantityBase: '160' }],
              meta: { page: 1, pageSize: 25, total: 1 },
            }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders products list with deliberate column structure on desktop', () => {
    expect(fixture.nativeElement.textContent).toContain('Bio-Enhanced Multi-Element Micronutrient Complex');
    expect(fixture.nativeElement.textContent).toContain('FERT-MICRO-50');
    expect(fixture.nativeElement.textContent).toContain('Batch + Expiry');
    expect(component.effectiveViewMode()).toBe('table');
  });

  it('toggles preferred view mode between table and cards on desktop', () => {
    expect(component.preferredViewMode()).toBe('table');
    component.setViewMode('cards');
    expect(component.preferredViewMode()).toBe('cards');
    expect(component.effectiveViewMode()).toBe('cards');
  });

  it('forces effective view mode to cards when on mobile viewport', () => {
    component.setViewMode('table');
    component.isMobile.set(true);
    expect(component.effectiveViewMode()).toBe('cards');

    // When returning to desktop, preferred table mode is restored
    component.isMobile.set(false);
    expect(component.effectiveViewMode()).toBe('table');
  });

  it('manages mobile filter drawer open/close state', () => {
    expect(component.mobileFiltersOpen()).toBe(false);
    component.openMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(true);
    component.closeMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(false);
  });

  it('calculates active filter count correctly', () => {
    expect(component.activeFiltersCount()).toBe(0);
    component.categoryFilter.set('cat-1');
    expect(component.activeFiltersCount()).toBe(1);
    component.trackingFilter.set('batch');
    expect(component.activeFiltersCount()).toBe(2);
    component.statusFilter.set('inactive');
    expect(component.activeFiltersCount()).toBe(3);
  });
});
