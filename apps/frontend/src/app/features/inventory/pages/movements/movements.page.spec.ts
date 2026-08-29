import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MovementsPage } from './movements.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { StockMovementRecord } from '../../models/inventory.models';

describe('MovementsPage', () => {
  let component: MovementsPage;
  let fixture: ComponentFixture<MovementsPage>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockInventoryApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCatalogApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLocationsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSessionStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCapabilityService: any;

  const mockMovements: StockMovementRecord[] = [
    {
      id: 'mov-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      batchId: 'batch-1',
      direction: 'inbound',
      quantityBase: '10.0000',
      enteredQuantity: '10.0000',
      unitCode: 'MT',
      conversionFactorSnapshot: '1.0000',
      packagingUnitId: null,
      inventoryValue: { amount: '280000.00', currency: 'PKR' },
      unitCost: { amount: '28000.00', currency: 'PKR' },
      sourceType: 'warehouse_transfer',
      sourceId: 'transfer-1',
      stockCondition: 'sellable',
      status: 'posted',
      postedAt: '2026-08-22T10:40:00.000Z',
      postedBy: 'user-1',
      productNameSnapshot: 'Urea 46%',
      productSkuSnapshot: 'URE-46',
      warehouseNameSnapshot: 'Main Warehouse',
      warehouseCodeSnapshot: 'WH1',
      batchNumberSnapshot: 'LOT-FFC-UREA-WH1',
    },
    {
      id: 'mov-2',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      batchId: 'batch-1',
      direction: 'outbound',
      quantityBase: '10.0000',
      enteredQuantity: '10.0000',
      unitCode: 'MT',
      conversionFactorSnapshot: '1.0000',
      packagingUnitId: null,
      inventoryValue: { amount: '280000.00', currency: 'PKR' },
      unitCost: { amount: '28000.00', currency: 'PKR' },
      sourceType: 'warehouse_transfer_reversal',
      sourceId: 'transfer-1',
      stockCondition: 'sellable',
      status: 'posted',
      postedAt: '2026-08-22T10:40:00.000Z',
      postedBy: 'user-1',
      productNameSnapshot: 'Urea 46%',
      productSkuSnapshot: 'URE-46',
      warehouseNameSnapshot: 'Main Warehouse',
      warehouseCodeSnapshot: 'WH1',
      batchNumberSnapshot: 'LOT-FFC-UREA-WH1',
    },
    {
      id: 'mov-3',
      organizationId: 'org-1',
      warehouseId: 'wh-2',
      productId: 'prod-2',
      batchId: 'batch-2',
      direction: 'inbound',
      quantityBase: '15.0000',
      enteredQuantity: '15.0000',
      unitCode: 'MT',
      conversionFactorSnapshot: '1.0000',
      packagingUnitId: null,
      inventoryValue: { amount: '225000.00', currency: 'PKR' },
      unitCost: { amount: '15000.00', currency: 'PKR' },
      sourceType: 'purchase',
      sourceId: 'po-1',
      stockCondition: 'sellable',
      status: 'posted',
      postedAt: '2026-08-21T04:15:00.000Z',
      postedBy: 'user-2',
      productNameSnapshot: 'MOP Fertilizer',
      productSkuSnapshot: 'MOP-01',
      warehouseNameSnapshot: 'Secondary Warehouse',
      warehouseCodeSnapshot: 'WH2',
      batchNumberSnapshot: 'LOT-MOP-0821',
    },
  ];

  const mockProducts = [
    {
      id: 'prod-1',
      name: 'Urea 46%',
      sku: 'URE-46',
      categoryId: 'cat-1',
      measurementDimension: 'mass',
      baseUnitCode: 'MT',
      trackingMode: 'batch_expiry' as const,
      status: 'active' as const,
      version: 1,
    },
    {
      id: 'prod-2',
      name: 'Potash (MOP)',
      sku: 'MOP-60',
      categoryId: 'cat-1',
      measurementDimension: 'mass',
      baseUnitCode: 'MT',
      trackingMode: 'batch_expiry' as const,
      status: 'active' as const,
      version: 1,
    },
  ];

  const mockWarehouses = [
    {
      id: 'wh-1',
      organizationId: 'org-1',
      name: 'Main Warehouse',
      code: 'WH1',
      status: 'active' as const,
      version: 1,
    },
    {
      id: 'wh-2',
      organizationId: 'org-1',
      name: 'Secondary Warehouse',
      code: 'WH2',
      status: 'active' as const,
      version: 1,
    },
  ];

  const mockBatches = [
    {
      id: 'batch-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      batchNumber: 'LOT-FFC-UREA-WH1',
      manufacturingDate: '2026-01-01',
      expiryDate: '2028-01-01',
      firstReceivedAt: '2026-08-22T10:40:00.000Z',
    },
    {
      id: 'batch-2',
      organizationId: 'org-1',
      productId: 'prod-2',
      batchNumber: 'LOT-MOP-0821',
      manufacturingDate: '2026-02-01',
      expiryDate: '2028-02-01',
      firstReceivedAt: '2026-08-21T04:15:00.000Z',
    },
  ];

  beforeEach(async () => {
    mockInventoryApi = {
      listMovements: vi.fn(() =>
        of({
          items: mockMovements,
          meta: { page: 1, pageSize: 25, total: 3 },
        }),
      ),
      listBatches: vi.fn(() =>
        of({
          items: mockBatches,
          meta: { page: 1, pageSize: 25, total: 2 },
        }),
      ),
      getBatch: vi.fn((id: string) => {
        const b = mockBatches.find((item) => item.id === id);
        return b ? of(b) : throwError(() => new Error('Not found'));
      }),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn(() => of(mockProducts)),
      getProduct: vi.fn((id: string) => {
        const p = mockProducts.find((item) => item.id === id);
        return p ? of(p) : throwError(() => new Error('Not found'));
      }),
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn(() => of(mockWarehouses)),
      getWarehouse: vi.fn((id: string) => {
        const w = mockWarehouses.find((item) => item.id === id);
        return w ? of(w) : throwError(() => new Error('Not found'));
      }),
    };

    mockSessionStore = {
      hasPermission: vi.fn(
        (perm: string) => perm === 'inventory.view' || perm === 'catalog.view',
      ),
    };

    mockCapabilityService = {
      canUseModule: vi.fn(() => true),
      canUseView: vi.fn(() => true),
      canShowWidget: vi.fn(() => true),
      canViewField: vi.fn(() => true),
      canPerformAction: vi.fn(() => true),
    };

    await TestBed.configureTestingModule({
      imports: [MovementsPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: mockInventoryApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: mockCapabilityService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MovementsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Initialization and Canonical Page Structure', () => {
    it('loads page, fetches movements and renders production header', () => {
      expect(component).toBeTruthy();
      expect(component.loading()).toBe(false);
      expect(component.movements().length).toBe(3);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.page-head__title')?.textContent?.trim()).toBe('Stock movements');
      expect(el.querySelector('.page-head__eyebrow')?.textContent?.trim()).toBe(
        'INVENTORY / MOVEMENTS',
      );
      expect(el.querySelector('.page-head__lede')?.textContent).toContain(
        'Authoritative movement history',
      );
      expect(el.querySelector('[data-testid="movements-refresh"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="movements-stock-link"]')).toBeTruthy();
    });

    it('renders module info card with authoritative audit guidance', () => {
      const el = fixture.nativeElement as HTMLElement;
      const moduleInfo = el.querySelector('agrivio-ui-module-info');
      expect(moduleInfo).toBeTruthy();
      expect(component.infoTitle).toBe('About Stock Movements');
      expect(component.infoDescription).toContain('Posted movements are immutable');
    });

    it('renders permission warning alert when inventory.view is missing', () => {
      mockSessionStore.hasPermission.mockReturnValue(false);
      const permFixture = TestBed.createComponent(MovementsPage);
      permFixture.detectChanges();

      expect(permFixture.componentInstance.canView()).toBe(false);
      const el = permFixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-permission-alert"]')).toBeTruthy();
      expect(el.textContent).toContain('You do not have permission to view stock movements.');
    });
  });

  describe('Authoritative KPI Section', () => {
    it('computes total count from backend metadata without faking global counts', () => {
      expect(component.kpiTotalMovements()).toBe(3);
      const el = fixture.nativeElement as HTMLElement;
      const totalCard = el.querySelector('[data-testid="kpi-total"]');
      expect(totalCard?.textContent).toContain('3');
      expect(totalCard?.textContent).toContain('All time');
    });

    it('computes inbound and outbound counts from loaded page movements', () => {
      // 2 inbound (mov-1, mov-3) and 1 outbound (mov-2)
      expect(component.kpiInboundCount()).toBe(2);
      expect(component.kpiOutboundCount()).toBe(1);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="kpi-inbound"]')?.textContent).toContain('2');
      expect(el.querySelector('[data-testid="kpi-outbound"]')?.textContent).toContain('1');
    });

    it('computes unique products and warehouses involved in loaded view', () => {
      expect(component.kpiProductsCount()).toBe(2);
      expect(component.kpiWarehousesCount()).toBe(2);
      expect(component.kpiProductsWarehousesLabel()).toBe('2 / 2');

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="kpi-products-warehouses"]')?.textContent).toContain(
        '2 / 2',
      );
    });
  });

  describe('Reference Enrichment and Fallback Resolution', () => {
    it('does not perform per-id enrichment requests on initial load', () => {
      expect(mockCatalogApi.getProduct).not.toHaveBeenCalled();
      expect(mockLocationsApi.getWarehouse).not.toHaveBeenCalled();
      expect(mockInventoryApi.getBatch).not.toHaveBeenCalled();
    });

    it('resolves product names and SKUs from list snapshots', () => {
      const p1 = component.resolveProduct(mockMovements[0]!);
      expect(p1.name).toBe('Urea 46%');
      expect(p1.sku).toBe('URE-46');
    });

    it('resolves warehouse name and code from list snapshots', () => {
      const w1 = component.resolveWarehouse(mockMovements[0]!);
      expect(w1.name).toBe('Main Warehouse');
      expect(w1.code).toBe('WH1');
    });

    it('resolves batch numbers from list snapshots', () => {
      const b1 = component.resolveBatch(mockMovements[0]!);
      expect(b1.batchNumber).toBe('LOT-FFC-UREA-WH1');
    });

    it('handles missing product gracefully without throwing', () => {
      const missingProd = component.resolveProduct({
        ...mockMovements[0]!,
        productId: 'unknown-prod-123456',
        productNameSnapshot: null,
        productSkuSnapshot: null,
      });
      expect(missingProd.name).toContain('Product (123456)');
      expect(missingProd.sku).toBe('—');
    });

    it('handles missing warehouse gracefully without throwing', () => {
      const missingWh = component.resolveWarehouse({
        ...mockMovements[0]!,
        warehouseId: 'unknown-wh-654321',
        warehouseNameSnapshot: null,
        warehouseCodeSnapshot: null,
      });
      expect(missingWh.name).toContain('Warehouse (654321)');
      expect(missingWh.code).toBe('654321');
    });

    it('handles missing or null batch gracefully without throwing', () => {
      const nullBatch = component.resolveBatch({ ...mockMovements[0]!, batchId: null });
      expect(nullBatch.batchNumber).toBe('—');
      expect(nullBatch.expiryDate).toBeNull();
    });
  });

  describe('Filter Toolbar & Operations', () => {
    it('filters by search term matching product, SKU, warehouse, or source label', () => {
      component.search.set('Urea');
      expect(component.filteredMovements().length).toBe(2);

      component.search.set('MOP-01');
      expect(component.filteredMovements().length).toBe(1);

      component.search.set('Purchase');
      expect(component.filteredMovements().length).toBe(1);

      component.search.set('NonExistent');
      expect(component.filteredMovements().length).toBe(0);
    });

    it('filters by direction (inbound / outbound)', () => {
      component.directionFilter.set('inbound');
      expect(component.filteredMovements().length).toBe(2);

      component.directionFilter.set('outbound');
      expect(component.filteredMovements().length).toBe(1);
      expect(component.filteredMovements()[0]?.id).toBe('mov-2');
    });

    it('filters by source type', () => {
      component.sourceTypeFilter.set('warehouse_transfer');
      expect(component.filteredMovements().length).toBe(1);
      expect(component.filteredMovements()[0]?.id).toBe('mov-1');

      component.sourceTypeFilter.set('purchase');
      expect(component.filteredMovements().length).toBe(1);
      expect(component.filteredMovements()[0]?.id).toBe('mov-3');
    });

    it('triggers server-side reload and resets page when warehouse filter changes', () => {
      mockInventoryApi.listMovements.mockClear();
      component.page.set(2);

      const event = { target: { value: 'wh-1' } } as unknown as Event;
      component.onWarehouseChange(event);

      expect(component.warehouseFilter()).toBe('wh-1');
      expect(component.page()).toBe(1);
      expect(mockInventoryApi.listMovements).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: 'wh-1',
          page: 1,
        }),
      );
    });

    it('triggers server-side reload and resets page when product filter changes', () => {
      mockInventoryApi.listMovements.mockClear();
      component.page.set(3);

      const event = { target: { value: 'prod-1' } } as unknown as Event;
      component.onProductChange(event);

      expect(component.productFilter()).toBe('prod-1');
      expect(component.page()).toBe(1);
      expect(mockInventoryApi.listMovements).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          page: 1,
        }),
      );
    });

    it('resets all active filters and reloads data when clearFilters is called', () => {
      component.search.set('test');
      component.warehouseFilter.set('wh-1');
      component.productFilter.set('prod-1');
      component.directionFilter.set('inbound');
      component.sourceTypeFilter.set('purchase');
      component.dateFilter.set('7d');
      component.page.set(2);

      expect(component.hasActiveFilters()).toBe(true);

      component.clearFilters();

      expect(component.search()).toBe('');
      expect(component.warehouseFilter()).toBe('');
      expect(component.productFilter()).toBe('');
      expect(component.directionFilter()).toBe('all');
      expect(component.sourceTypeFilter()).toBe('all');
      expect(component.dateFilter()).toBe('all');
      expect(component.page()).toBe(1);
    });
  });

  describe('Movement Table Presentation & Formatting', () => {
    it('renders correct table columns, badges, and values without calculating', () => {
      const el = fixture.nativeElement as HTMLElement;
      const table = el.querySelector('.ag-table');
      expect(table).toBeTruthy();

      const rows = el.querySelectorAll('[data-testid="movement-row"]');
      expect(rows.length).toBe(3);

      const firstRow = rows[0];
      expect(firstRow?.textContent).toContain('Urea 46%');
      expect(firstRow?.textContent).toContain('SKU: URE-46');
      expect(firstRow?.textContent).toContain('Main Warehouse');
      expect(firstRow?.textContent).toContain('Inbound');
      expect(firstRow?.textContent).toContain('Warehouse Transfer');
      expect(firstRow?.textContent).toContain('10.0000');
      expect(firstRow?.textContent).toContain('MT');
      expect(firstRow?.textContent).toContain('PKR 280,000.00');
      expect(firstRow?.textContent).toContain('LOT-FFC-UREA-WH1');
    });

    it('formats source types correctly with human-friendly labels', () => {
      expect(component.sourceTypeLabel('opening_stock')).toBe('Opening Stock');
      expect(component.sourceTypeLabel('stock_adjustment')).toBe('Stock Adjustment');
      expect(component.sourceTypeLabel('stock_adjustment_reversal')).toBe(
        'Stock Adjustment (Reversal)',
      );
      expect(component.sourceTypeLabel('warehouse_transfer')).toBe('Warehouse Transfer');
      expect(component.sourceTypeLabel('warehouse_transfer_reversal')).toBe(
        'Warehouse Transfer (Reversal)',
      );
      expect(component.sourceTypeLabel('purchase')).toBe('Purchase Receipt');
      expect(component.sourceTypeLabel('sale')).toBe('Sale / Dispatch');
    });

    it('formats date and time accurately', () => {
      const formatted = component.formatPostedDate('2026-08-22T10:40:00.000Z');
      expect(formatted.date).toContain('2026');
      expect(formatted.time).toBeTruthy();
    });
  });

  describe('Movement Inspector Slide-Over Drawer', () => {
    it('opens drawer with full movement details when Inspect button is clicked', () => {
      expect(component.selectedMovement()).toBeNull();

      const mov = mockMovements[0];
      if (mov) {
        component.openInspector(mov);
      }
      fixture.detectChanges();

      expect(component.selectedMovement()?.id).toBe('mov-1');

      const el = fixture.nativeElement as HTMLElement;
      const drawer = el.querySelector('[data-testid="movement-inspector-drawer"]');
      expect(drawer).toBeTruthy();
      expect(drawer?.textContent).toContain('mov-1');
      expect(drawer?.textContent).toContain('Urea 46%');
      expect(drawer?.textContent).toContain('Main Warehouse');
      expect(drawer?.textContent).toContain('LOT-FFC-UREA-WH1');
      expect(drawer?.textContent).toContain('PKR 280,000.00');
      expect(drawer?.textContent).toContain('Posted (Immutable)');
    });

    it('closes drawer on backdrop click, close button, or escape key', () => {
      const mov = mockMovements[0];
      if (mov) {
        component.openInspector(mov);
      }
      fixture.detectChanges();
      expect(component.selectedMovement()).toBeTruthy();

      component.onEscape();
      expect(component.selectedMovement()).toBeNull();

      if (mov) {
        component.openInspector(mov);
      }
      expect(component.selectedMovement()).toBeTruthy();

      component.closeInspector();
      expect(component.selectedMovement()).toBeNull();
    });
  });

  describe('Responsive / Mobile Layout', () => {
    it('switches to cards view when viewMode is cards or mobile viewport', () => {
      component.setViewMode('cards');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-cards"]')).toBeTruthy();
      const cards = el.querySelectorAll('[data-testid="movement-card"]');
      expect(cards.length).toBe(3);
    });

    it('opens and closes mobile filter sheet', () => {
      expect(component.mobileFiltersOpen()).toBe(false);
      component.openMobileFilters();
      expect(component.mobileFiltersOpen()).toBe(true);
      component.closeMobileFilters();
      expect(component.mobileFiltersOpen()).toBe(false);
    });
  });

  describe('Pagination Behavior', () => {
    it('requests new page and preserves filters when page changes', () => {
      mockInventoryApi.listMovements.mockClear();
      component.onPageChange(2);

      expect(component.page()).toBe(2);
      expect(mockInventoryApi.listMovements).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 25,
        }),
      );
    });

    it('does not repeat warehouse or product option loads on pagination or refresh', () => {
      mockInventoryApi.listMovements.mockClear();
      mockLocationsApi.listWarehouseOptions.mockClear();
      mockCatalogApi.searchProductOptions.mockClear();

      component.onPageChange(2);
      component.reload();

      expect(mockInventoryApi.listMovements.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mockLocationsApi.listWarehouseOptions).not.toHaveBeenCalled();
      expect(mockCatalogApi.searchProductOptions).not.toHaveBeenCalled();
    });

    it('resets page to 1 when page size changes', () => {
      mockInventoryApi.listMovements.mockClear();
      component.page.set(3);
      component.onPageSizeChange(50);

      expect(component.pageSize()).toBe(50);
      expect(component.page()).toBe(1);
      expect(mockInventoryApi.listMovements).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
        }),
      );
    });
  });

  describe('Error Handling and Retry', () => {
    it('displays error alert on API failure and allows retry', () => {
      mockInventoryApi.listMovements.mockImplementation(() =>
        throwError(() => new Error('Network error')),
      );
      component.reload();
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(component.errorMessage()).toBe('Unable to load stock movements.');

      // Restore and reload
      mockInventoryApi.listMovements.mockImplementation(() =>
        of({ items: mockMovements, meta: { page: 1, pageSize: 25, total: 3 } }),
      );
      component.reload();
      fixture.detectChanges();

      expect(component.errorMessage()).toBeNull();
      expect(component.movements().length).toBe(3);
    });
  });

  describe('Capability Integration & Feature Toggles', () => {
    it('disables module access and prevents API calls when inventory.movements is disabled', () => {
      mockInventoryApi.listMovements.mockClear();
      mockCapabilityService.canUseModule.mockImplementation((mod: string) => mod !== 'inventory.movements');

      const disFixture = TestBed.createComponent(MovementsPage);
      disFixture.detectChanges();
      const comp = disFixture.componentInstance;

      expect(comp.canUseMovements()).toBe(false);
      expect(comp.canView()).toBe(false);
      expect(comp.movements()).toEqual([]);
      expect(comp.total()).toBe(0);
      expect(mockInventoryApi.listMovements).not.toHaveBeenCalled();

      const el = disFixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-permission-alert"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="movements-list"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-cards"]')).toBeFalsy();
    });

    it('hides module info when inventory.movements.features.moduleInfo is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.moduleInfo',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showModuleInfo()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('agrivio-ui-module-info')).toBeFalsy();
    });

    it('hides search field when inventory.movements.features.search is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.search',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showSearch()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-search"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-mobile-search"]')).toBeFalsy();
    });

    it('hides filters when inventory.movements.features.filters is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.filters',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showFilters()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-product-filter"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-warehouse-filter"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-direction-filter"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-mobile-filter-trigger"]')).toBeFalsy();
    });

    it('hides KPI summary cards when inventory.movements.features.kpiCards is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.kpiCards',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showKpis()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-kpis"]')).toBeFalsy();
    });

    it('gracefully degrades reference resolution by hiding secondary SKU/Code while preserving primary human-readable labels and never exposing raw IDs as primary names', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.referenceResolution',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showReferenceResolution()).toBe(false);

      const resolvedProd = component.resolveProduct(mockMovements[0]!);
      expect(resolvedProd.name).toBe('Urea 46%');
      expect(resolvedProd.sku).toBe('—');

      const resolvedWh = component.resolveWarehouse(mockMovements[0]!);
      expect(resolvedWh.name).toBe('Main Warehouse');
      expect(resolvedWh.code).toBe('—');

      const fallbackProd = component.resolveProduct({
        ...mockMovements[0]!,
        productId: '66c000000000000000000099',
        productNameSnapshot: null,
        productSkuSnapshot: null,
      });
      expect(fallbackProd.name).toBe('Product (000099)');

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.product-sku')).toBeFalsy();
    });

    it('hides inspector button and prevents opening drawer when inventory.movements.features.inspector is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.inspector',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showInspector()).toBe(false);
      expect(component.canInspectMovement()).toBe(false);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="inspect-movement-btn"]')).toBeFalsy();

      const mov = mockMovements[0];
      if (mov) {
        component.openInspector(mov);
      }
      fixture.detectChanges();
      expect(component.selectedMovement()).toBeNull();
      expect(el.querySelector('[data-testid="movement-inspector-drawer"]')).toBeFalsy();
    });

    it('hides technical details in drawer when inventory.movements.features.technicalDetails is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.technicalDetails',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showTechnicalDetails()).toBe(false);

      const mov = mockMovements[0];
      if (mov) {
        component.openInspector(mov);
      }
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movement-inspector-drawer"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="technical-details"]')).toBeFalsy();
    });

    it('preserves mobile cards on mobile and forces table on desktop when inventory.movements.features.mobileCards is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.movements.features.mobileCards',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.showMobileCards()).toBe(false);
      // On mobile screens (< 768px), responsive card renderer is always preserved
      component.isMobile.set(true);
      expect(component.effectiveViewMode()).toBe('cards');

      // On desktop, cards view is disabled and forced to table
      component.isMobile.set(false);
      component.preferredViewMode.set('cards');
      expect(component.effectiveViewMode()).toBe('table');

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.view-toggle')).toBeFalsy();
    });
  });

  describe('Capability Dependency Regressions', () => {
    it('Scenario 1: Disabling inventory.stock disables View Stock action while Stock Movements inquiry continues to work', () => {
      mockCapabilityService.canUseModule.mockImplementation(
        (mod: string) => mod !== 'inventory.stock',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.canUseMovements()).toBe(true);
      expect(component.canView()).toBe(true);
      expect(component.canViewStock()).toBe(false);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-stock-link"]')).toBeFalsy();
      expect(el.querySelector('[data-testid="movements-list"]')).toBeTruthy();
    });

    it('Scenario 2: Disabling inventory.products disables View Product action while Movement history continues to work', () => {
      mockCapabilityService.canUseModule.mockImplementation(
        (mod: string) => mod !== 'inventory.products',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.canUseMovements()).toBe(true);
      expect(component.canView()).toBe(true);
      expect(component.canViewProduct()).toBe(false);
      expect(component.movements().length).toBe(3);
    });

    it('Scenario 3: Disabling inventory.batches disables View Batch action while Movements inquiry continues to work', () => {
      mockCapabilityService.canUseModule.mockImplementation(
        (mod: string) => mod !== 'inventory.batches',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.canUseMovements()).toBe(true);
      expect(component.canView()).toBe(true);
      expect(component.canViewBatch()).toBe(false);
      expect(component.canViewBatches()).toBe(false);

      const el = fixture.nativeElement as HTMLElement;
      const navLinks = Array.from(el.querySelectorAll('.nav-overflow-link')).map(
        (a) => a.textContent?.trim(),
      );
      expect(navLinks).not.toContain('Batches');
    });

    it('hides refresh button when inventory.movements.actions.refresh is disabled', () => {
      mockCapabilityService.canPerformAction.mockImplementation(
        (act: string) => act !== 'inventory.movements.actions.refresh',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.canRefresh()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="movements-refresh"]')).toBeFalsy();
    });

    it('disables inspect action when inventory.movements.actions.inspect is disabled', () => {
      mockCapabilityService.canPerformAction.mockImplementation(
        (act: string) => act !== 'inventory.movements.actions.inspect',
      );
      fixture = TestBed.createComponent(MovementsPage);
      fixture.detectChanges();
      component = fixture.componentInstance;

      expect(component.canInspect()).toBe(false);
      expect(component.canInspectMovement()).toBe(false);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="inspect-movement-btn"]')).toBeFalsy();
    });
  });
});


