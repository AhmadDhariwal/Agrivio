import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ProductsPage } from './products.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('ProductsPage', () => {
  let component: ProductsPage;
  let fixture: ComponentFixture<ProductsPage>;
  let capabilityState: ReturnType<typeof signal<Record<string, Record<string, boolean>>>>;
  let searchCategoryOptions: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    capabilityState = signal({});
    searchCategoryOptions = vi.fn(() =>
      of([{ id: 'cat-1', name: 'Fertilizers', productClass: 'fertilizer' }]),
    );
    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;
    await TestBed.configureTestingModule({
      imports: [ProductsPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () =>
              of({
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
                    listSummary: {
                      sellingPrice: { amount: '5800.00', currency: 'PKR' },
                      availableQuantityBase: '160.0000',
                    },
                  },
                ],
                meta: { page: 1, pageSize: 25, total: 1 },
              }),
            searchCategoryOptions,
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseView: (key: string) => capabilityValue(key, 'enabled'),
            canShowWidget: (key: string) => capabilityValue(key, 'visible'),
            canViewField: (key: string) => capabilityValue(key, 'visible'),
            canEditField: (key: string) => capabilityValue(key, 'editable'),
            canPerformAction: (key: string) => capabilityValue(key, 'allowed'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders products list with deliberate column structure on desktop', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'Bio-Enhanced Multi-Element Micronutrient Complex',
    );
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

  it('hides configured widgets and fields without leaving empty KPI cards', () => {
    capabilityState.set({
      'inventory.products.widgets.lowStock': { visible: false },
      'inventory.products.fields.sku': { visible: false },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Low / Out of Stock');
    expect(fixture.nativeElement.textContent).not.toContain('FERT-MICRO-50');
    expect(fixture.nativeElement.querySelectorAll('.kpi-card')).toHaveLength(3);
  });

  it('removes blocked actions and the optional desktop cards view', () => {
    capabilityState.set({
      'inventory.products.actions.managePricing': { allowed: false },
      'inventory.products.views.desktopCards': { enabled: false },
    });
    component.toggleRowMenu('prod-1', new MouseEvent('click'));
    fixture.detectChanges();

    expect(component.canManagePricing()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Manage Pricing');
    expect(fixture.nativeElement.querySelector('[aria-label="Card grid view"]')).toBeFalsy();
    component.setViewMode('cards');
    expect(component.effectiveViewMode()).toBe('table');

    component.isMobile.set(true);
    expect(component.effectiveViewMode()).toBe('cards');
  });

  it('uses bounded category search for the category filter', async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    searchCategoryOptions.mockClear();

    const input = document.createElement('input');
    input.value = 'seed';
    component.onCategorySearch({ target: input } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(searchCategoryOptions).toHaveBeenCalledWith('seed', 'all');
    expect(searchCategoryOptions).toHaveBeenCalledTimes(1);
  });

  it('renders the module info section', () => {
    const moduleInfo = fixture.nativeElement.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).not.toBeNull();
    expect(moduleInfo.textContent).toContain('About Product Catalog');
  });
});
