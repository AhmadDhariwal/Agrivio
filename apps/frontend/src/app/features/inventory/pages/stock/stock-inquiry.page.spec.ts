import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StockInquiryPage } from './stock-inquiry.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('StockInquiryPage', () => {
  let component: StockInquiryPage;
  let fixture: ComponentFixture<StockInquiryPage>;
  let capabilityState: ReturnType<typeof signal<Record<string, Record<string, boolean>>>>;
  let batchListFails: boolean;
  let listBalancesCalls: number;
  let listWarehouseOptionsCalls: number;
  let searchProductOptionsCalls: number;

  const mockBalances = [
    {
      id: 'bal-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      batchId: 'batch-1',
      batchNumberSnapshot: 'BT-240819-03',
      quantityBase: '65.0000',
      unsellableQuantityBase: '0.0000',
      version: 1,
      valuation: {
        inventoryValue: { amount: '182000.00', currency: 'PKR' },
        weightedAverageCost: { amount: '2800.00', currency: 'PKR' },
        warehouseProductQuantityBase: '65.0000',
      },
    },
    {
      id: 'bal-2',
      organizationId: 'org-1',
      warehouseId: 'wh-2',
      productId: 'prod-2',
      batchId: null,
      quantityBase: '100.0000',
      version: 1,
      valuation: {
        inventoryValue: { amount: '450000.00', currency: 'PKR' },
        weightedAverageCost: { amount: '4500.00', currency: 'PKR' },
        warehouseProductQuantityBase: '100.0000',
      },
    },
  ];

  const mockProducts = [
    {
      id: 'prod-1',
      name: 'Urea Fertilizer 50kg',
      sku: 'UREA-50',
      categoryId: 'cat-1',
      measurementDimension: 'mass',
      baseUnitCode: 'KG',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
    {
      id: 'prod-2',
      name: 'DAP Fertilizer 50kg',
      sku: 'DAP-50',
      categoryId: 'cat-1',
      measurementDimension: 'mass',
      baseUnitCode: 'BAG',
      trackingMode: 'none',
      status: 'active',
      version: 1,
    },
  ];

  const mockWarehouses = [
    {
      id: 'wh-1',
      organizationId: 'org-1',
      name: 'Main Central Warehouse',
      code: 'WH-MAIN',
      status: 'active',
      version: 1,
    },
    {
      id: 'wh-2',
      organizationId: 'org-1',
      name: 'North Branch Warehouse',
      code: 'WH-NORTH',
      status: 'active',
      version: 1,
    },
  ];

  const mockBatches = [
    {
      id: 'batch-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      batchNumber: 'BT-240819-03',
      manufacturingDate: '2026-01-01',
      expiryDate: '2027-01-01',
      firstReceivedAt: '2026-01-15T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    capabilityState = signal({});
    batchListFails = false;
    listBalancesCalls = 0;
    listWarehouseOptionsCalls = 0;
    searchProductOptionsCalls = 0;
    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;
    await TestBed.configureTestingModule({
      imports: [StockInquiryPage],
      providers: [
        provideRouter([]),
        {
          provide: InventoryApi,
          useValue: {
            listBalances: () => {
              listBalancesCalls += 1;
              return of({
                items: mockBalances,
                meta: { page: 1, pageSize: 25, total: 2 },
              });
            },
            listBatches: () =>
              batchListFails
                ? throwError(() => new Error('Product Batches unavailable'))
                : of({
                    items: mockBatches,
                    meta: { page: 1, pageSize: 100, total: 1 },
                  }),
            listExpiry: () =>
              of({
                items: [
                  {
                    warehouseId: 'wh-1',
                    productId: 'prod-1',
                    batchId: 'batch-1',
                    batchNumber: 'BT-240819-03',
                    expiryDate: '2027-01-01',
                    quantityBase: '65.0000',
                    classification: 'normal' as const,
                    businessDate: '2026-08-19',
                    thresholdDays: 30,
                  },
                ],
                businessDate: '2026-08-19',
                thresholdDays: 30,
              }),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            searchProductOptions: () => {
              searchProductOptionsCalls += 1;
              return of(mockProducts);
            },
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouseOptions: () => {
              listWarehouseOptionsCalls += 1;
              return of(mockWarehouses);
            },
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => capabilityValue(key, 'enabled'),
            canUseView: (key: string) => capabilityValue(key, 'enabled'),
            canShowWidget: (key: string) => capabilityValue(key, 'visible'),
            canViewField: (key: string) => capabilityValue(key, 'visible'),
            canPerformAction: (key: string) => capabilityValue(key, 'allowed'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StockInquiryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads reference data once on init and does not repeat warehouse/product calls on pagination', () => {
    expect(listWarehouseOptionsCalls).toBe(1);
    expect(searchProductOptionsCalls).toBe(1);
    expect(listBalancesCalls).toBe(1);

    component.onPageChange(2);
    expect(listBalancesCalls).toBe(2);
    expect(listWarehouseOptionsCalls).toBe(1);
    expect(searchProductOptionsCalls).toBe(1);
  });

  it('issues one balance request when warehouse filter and page reset change together', () => {
    listBalancesCalls = 0;
    component.onWarehouseChange({ target: { value: 'wh-1' } } as unknown as Event);
    expect(listBalancesCalls).toBe(1);
    expect(component.page()).toBe(1);
  });

  it('renders stock on hand title, KPIs and table rows with resolved names and formatted numbers', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Stock on hand');
    expect(text).toContain('Urea Fertilizer 50kg');
    expect(text).toContain('Main Central Warehouse');
    expect(text).toContain('BT-240819-03');
    expect(text).toContain('65.0000');
    expect(text).toContain('2,800.00');
    expect(text).toContain('182,000.00');
  });

  it('calculates authoritative KPIs from whole dataset queries, not current page slice', () => {
    expect(component.total()).toBe(2);
    expect(component.warehousesCount()).toBe(2);
    expect(component.productsCount()).toBe(2);
  });

  it('formats currency with tabular format and precision preservation', () => {
    expect(component.formatMoney('2800.00')).toBe('2,800.00');
    expect(component.formatMoney('182000.00')).toBe('182,000.00');
    expect(component.formatQuantity('65.0000')).toBe('65.0000');
    expect(component.formatQuantity('1250.5000')).toBe('1,250.5000');
  });

  it('opens and closes the slide-over inspector drawer on row click', () => {
    expect(component.selectedBalance()).toBeNull();

    // Select row 0
    component.selectBalance(mockBalances[0]!);
    fixture.detectChanges();

    expect(component.selectedBalance()?.id).toBe('bal-1');
    const drawer = fixture.nativeElement.querySelector('.inspector-drawer');
    expect(drawer).toBeTruthy();
    expect(drawer.textContent).toContain('Urea Fertilizer 50kg');
    expect(drawer.textContent).toContain('BT-240819-03');
    expect(drawer.textContent).toContain('182,000.00');

    // Close inspector
    component.closeInspector();
    fixture.detectChanges();
    expect(component.selectedBalance()).toBeNull();
  });

  it('allows switching between table and card view modes', () => {
    expect(component.effectiveViewMode()).toBe('table');

    component.setViewMode('cards');
    fixture.detectChanges();
    expect(component.effectiveViewMode()).toBe('cards');

    const cards = fixture.nativeElement.querySelector('[data-testid="stock-cards"]');
    expect(cards).toBeTruthy();

    component.setViewMode('table');
    fixture.detectChanges();
    expect(component.effectiveViewMode()).toBe('table');
  });

  it('applies filters and resets to page 1', () => {
    const event = { target: { value: 'wh-1' } } as unknown as Event;
    component.onWarehouseChange(event);
    expect(component.warehouseFilter()).toBe('wh-1');
    expect(component.page()).toBe(1);

    component.clearFilters();
    expect(component.warehouseFilter()).toBe('');
    expect(component.productFilter()).toBe('');
    expect(component.search()).toBe('');
  });

  it('applies WAC, Inventory Value, Batch, and Status visibility to table, cards, and inspector', () => {
    capabilityState.set({
      'inventory.stock.fields.wac': { visible: false },
      'inventory.stock.fields.inventoryValue': { visible: false },
      'inventory.stock.fields.batch': { visible: false },
      'inventory.stock.fields.warehouse': { visible: false },
      'inventory.stock.fields.status': { visible: false },
    });
    component.selectBalance(mockBalances[0]!);
    fixture.detectChanges();

    const tableText = fixture.nativeElement.querySelector('.stock-table').textContent;
    expect(tableText).not.toContain('WAC');
    expect(tableText).not.toContain('Inventory Value');
    expect(tableText).not.toContain('BT-240819-03');
    expect(tableText).not.toContain('Main Central Warehouse');
    const inspectorText = fixture.nativeElement.querySelector('.inspector-drawer').textContent;
    expect(inspectorText).not.toContain('Weighted Avg Cost');
    expect(inspectorText).not.toContain('Inventory Value');
    expect(inspectorText).not.toContain('Batch / Lot #');
    expect(inspectorText).not.toContain('Main Central Warehouse');
    expect(inspectorText).not.toContain('Stock State');

    component.setViewMode('cards');
    fixture.detectChanges();
    const cardsText = fixture.nativeElement.querySelector(
      '[data-testid="stock-cards"]',
    ).textContent;
    expect(cardsText).not.toContain('WAC');
    expect(cardsText).not.toContain('Inventory Value');
    expect(cardsText).not.toContain('BT-240819-03');
    expect(cardsText).not.toContain('Main Central Warehouse');
  });

  it('removes the KPI region when every authoritative widget is hidden', () => {
    capabilityState.set({
      'inventory.stock.widgets.stockRecords': { visible: false },
      'inventory.stock.widgets.activeWarehouses': { visible: false },
      'inventory.stock.widgets.catalogProducts': { visible: false },
      'inventory.stock.widgets.expiringExpired': { visible: false },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="stock-kpis"]')).toBeNull();
  });

  it('disables desktop cards while preserving required responsive mobile cards', () => {
    capabilityState.set({
      'inventory.stock.views.desktopCards': { enabled: false },
    });
    component.setViewMode('cards');
    fixture.detectChanges();
    expect(component.effectiveViewMode()).toBe('table');
    expect(fixture.nativeElement.querySelector('[data-testid="stock-cards"]')).toBeNull();

    component.isMobile.set(true);
    fixture.detectChanges();
    expect(component.effectiveViewMode()).toBe('cards');
    expect(fixture.nativeElement.querySelector('[data-testid="stock-cards"]')).toBeTruthy();
  });

  it('hides configured filters without changing their backend support', () => {
    capabilityState.set({
      'inventory.stock.features.search': { enabled: false },
      'inventory.stock.features.warehouseFilter': { enabled: false },
      'inventory.stock.features.productFilter': { enabled: false },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="stock-search"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="stock-warehouse-filter"]'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="stock-product-filter"]')).toBeNull();
  });

  it('blocks the inspect affordance and drawer when Inspect Stock is disabled', () => {
    capabilityState.set({
      'inventory.stock.actions.inspect': { allowed: false },
    });
    fixture.detectChanges();
    component.selectBalance(mockBalances[0]!);
    fixture.detectChanges();

    expect(component.selectedBalance()).toBeNull();
    expect(fixture.nativeElement.querySelector('.card-action-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.inspector-drawer')).toBeNull();
  });

  it('hides the cross-module Opening Stock action when its module or Post action is disabled', () => {
    capabilityState.set({
      'inventory.openingStock': { enabled: false },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="stock-opening-link"]')).toBeNull();

    capabilityState.set({
      'inventory.openingStock': { enabled: true },
      'inventory.openingStock.actions.post': { allowed: false },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="stock-opening-link"]')).toBeNull();
  });

  it('hides Product Batches cross-links when the target module is disabled', () => {
    const firstBalance = mockBalances[0];
    if (!firstBalance) throw new Error('Expected balance fixture');
    capabilityState.set({
      'inventory.batches': { enabled: false },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="stock-batches-link"]')).toBeNull();

    component.selectBalance(firstBalance);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="inspector-batches-link"]'),
    ).toBeNull();
  });

  it('renders em dash instead of raw batch ID when batchNumberSnapshot is absent', () => {
    const { batchNumberSnapshot: _ignored, ...balanceWithoutSnapshot } = mockBalances[0]!;
    expect(component.batchNumber(balanceWithoutSnapshot as typeof mockBalances[number])).toBe('—');
  });

  it('keeps Stock on Hand available without product-scoped batch preload on init', async () => {
    batchListFails = true;
    const deniedFixture = TestBed.createComponent(StockInquiryPage);
    deniedFixture.detectChanges();
    const deniedComponent = deniedFixture.componentInstance;

    expect(deniedComponent.errorMessage()).toBeNull();
    expect(deniedComponent.balances()).toHaveLength(2);
    expect(deniedComponent.batchList()).toEqual([]);
    expect(deniedFixture.nativeElement.textContent).toContain('BT-240819-03');
  });

  it('shows a feature-unavailable state if the organization disables Stock on Hand', () => {
    capabilityState.set({
      'inventory.stock': { enabled: false },
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="stock-feature-unavailable"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Stock on Hand is unavailable');
  });

  it('renders the module info section', () => {
    const moduleInfo = fixture.nativeElement.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).not.toBeNull();
    expect(moduleInfo.textContent).toContain('About Stock on Hand');
  });
});
