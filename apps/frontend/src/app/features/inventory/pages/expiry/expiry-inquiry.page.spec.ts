import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ExpiryInquiryPage } from './expiry-inquiry.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpiryInquiryPage', () => {
  let component: ExpiryInquiryPage;
  let fixture: ComponentFixture<ExpiryInquiryPage>;

  const mockExpiryItems = [
    {
      warehouseId: 'wh-1',
      productId: 'prod-1',
      batchId: 'batch-1',
      batchNumber: 'LOT-CHL-NEAR-EXP',
      expiryDate: '2026-09-04',
      quantityBase: '25.0000',
      classification: 'upcoming' as const,
      businessDate: '2026-08-21',
      thresholdDays: 30,
    },
    {
      warehouseId: 'wh-1',
      productId: 'prod-2',
      batchId: 'batch-2',
      batchNumber: 'LOT-IMI-EXPIRED',
      expiryDate: '2026-07-23',
      quantityBase: '15.0000',
      classification: 'expired' as const,
      businessDate: '2026-08-21',
      thresholdDays: 30,
    },
    {
      warehouseId: 'wh-2',
      productId: 'prod-3',
      batchId: 'batch-3',
      batchNumber: 'LOT-LAMBDA-WH1',
      expiryDate: '2027-09-21',
      quantityBase: '23.0000',
      classification: 'normal' as const,
      businessDate: '2026-08-21',
      thresholdDays: 30,
    },
  ];

  const mockProducts = [
    {
      id: 'prod-1',
      name: 'Chlorpyrifos 40 EC',
      sku: 'CHL-40EC',
      categoryId: 'cat-1',
      measurementDimension: 'volume',
      baseUnitCode: 'LITRE',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
    {
      id: 'prod-2',
      name: 'Imidacloprid 200 SL',
      sku: 'IMI-200SL',
      categoryId: 'cat-1',
      measurementDimension: 'volume',
      baseUnitCode: 'LITRE',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
    {
      id: 'prod-3',
      name: 'Lambda Cyhalothrin 5 EC',
      sku: 'LAM-5EC',
      categoryId: 'cat-1',
      measurementDimension: 'volume',
      baseUnitCode: 'LITRE',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
  ];

  const mockWarehouses = [
    {
      id: 'wh-1',
      organizationId: 'org-1',
      name: 'Lahore Main Warehouse',
      code: 'WH-LHE',
      status: 'active',
      version: 1,
    },
    {
      id: 'wh-2',
      organizationId: 'org-1',
      name: 'Multan Warehouse',
      code: 'WH-MUL',
      status: 'active',
      version: 1,
    },
  ];

  const mockBatches = [
    {
      id: 'batch-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      batchNumber: 'LOT-CHL-NEAR-EXP',
      manufacturingDate: '2025-09-04',
      expiryDate: '2026-09-04',
      firstReceivedAt: '2025-09-10T10:00:00.000Z',
    },
    {
      id: 'batch-2',
      organizationId: 'org-1',
      productId: 'prod-2',
      batchNumber: 'LOT-IMI-EXPIRED',
      manufacturingDate: '2024-07-23',
      expiryDate: '2026-07-23',
      firstReceivedAt: '2024-08-01T10:00:00.000Z',
    },
    {
      id: 'batch-3',
      organizationId: 'org-1',
      productId: 'prod-3',
      batchNumber: 'LOT-LAMBDA-WH1',
      manufacturingDate: '2025-09-21',
      expiryDate: '2027-09-21',
      firstReceivedAt: '2025-10-01T10:00:00.000Z',
    },
  ];

  let mockInventoryApi: {
    listExpiry: ReturnType<typeof vi.fn>;
    listBatches: ReturnType<typeof vi.fn>;
  };
  let mockCatalogApi: {
    searchProductOptions: ReturnType<typeof vi.fn>;
  };
  let mockLocationsApi: {
    listWarehouseOptions: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    hasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockInventoryApi = {
      listExpiry: vi.fn().mockReturnValue(
        of({
          items: mockExpiryItems,
          businessDate: '2026-08-21',
          thresholdDays: 30,
        }),
      ),
      listBatches: vi.fn().mockReturnValue(
        of({
          items: mockBatches,
          meta: { page: 1, pageSize: 500, total: 3 },
        }),
      ),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn().mockReturnValue(of(mockProducts)),
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn().mockReturnValue(of(mockWarehouses)),
    };

    mockSessionStore = {
      hasPermission: vi.fn((perm: string) => perm === 'inventory.expiry.view' || perm === 'inventory.view' || perm === 'catalog.view'),
    };

    await TestBed.configureTestingModule({
      imports: [ExpiryInquiryPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: mockInventoryApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpiryInquiryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load expiry data with relation maps', () => {
    expect(component).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.rawItems().length).toBe(3);
    expect(component.businessDate()).toBe('2026-08-21');
    expect(component.thresholdDays()).toBe(30);
    expect(component.productMap().size).toBe(3);
    expect(component.warehouseMap().size).toBe(2);
  });

  it('should display permission alert if user lacks permission', () => {
    mockSessionStore.hasPermission.mockImplementation((perm: string) => perm !== 'inventory.expiry.view');
    fixture = TestBed.createComponent(ExpiryInquiryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.canView()).toBe(false);
    const alert = fixture.nativeElement.querySelector('agrivio-ui-alert');
    expect(alert).toBeTruthy();
  });

  it('should compute authoritative KPIs across the organization scope', () => {
    expect(component.totalRecordsCount()).toBe(3);
    expect(component.expiringSoonCount()).toBe(1);
    expect(component.expiredCount()).toBe(1);
    expect(component.trackedProductsCount()).toBe(3);
    expect(component.trackedWarehousesCount()).toBe(2);
  });

  it('should render table rows with backwards-compatible test IDs', () => {
    const table = fixture.nativeElement.querySelector('[data-testid="expiry-list"]');
    expect(table).toBeTruthy();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="expiry-row"]');
    expect(rows.length).toBe(3);
  });

  it('should filter items by search query', () => {
    component.search.set('Chlorpyrifos');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0]?.batchNumber).toBe('LOT-CHL-NEAR-EXP');

    component.search.set('WH-MUL');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0]?.batchNumber).toBe('LOT-LAMBDA-WH1');
  });

  it('should filter items by classification', () => {
    component.classificationFilter.set('expired');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0]?.batchNumber).toBe('LOT-IMI-EXPIRED');

    component.classificationFilter.set('upcoming');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0]?.batchNumber).toBe('LOT-CHL-NEAR-EXP');
  });

  it('should filter items by warehouse and product', () => {
    component.warehouseFilter.set('wh-1');
    expect(component.filteredItems().length).toBe(2);

    component.productFilter.set('prod-1');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0]?.productId).toBe('prod-1');
  });

  it('should clear all filters', () => {
    component.search.set('test');
    component.productFilter.set('prod-1');
    component.warehouseFilter.set('wh-1');
    component.classificationFilter.set('upcoming');

    component.clearFilters();

    expect(component.search()).toBe('');
    expect(component.productFilter()).toBe('');
    expect(component.warehouseFilter()).toBe('');
    expect(component.classificationFilter()).toBe('');
    expect(component.filteredItems().length).toBe(3);
  });

  it('should open and close Expiry Inspector drawer', () => {
    expect(component.selectedItem()).toBeNull();

    component.openInspector(mockExpiryItems[0]!);
    expect(component.selectedItem()).toEqual(mockExpiryItems[0]!);

    fixture.detectChanges();
    const inspector = fixture.nativeElement.querySelector('[data-testid="expiry-inspector"]');
    expect(inspector).toBeTruthy();

    component.closeInspector();
    expect(component.selectedItem()).toBeNull();
  });

  it('should format dates and quantities accurately', () => {
    expect(component.formatDate('2026-09-04')).toContain('2026');
    expect(component.formatDate('2026-09-04')).toContain('04');
    expect(component.formatQuantity('25.0000')).toBe('25');
    expect(component.formatQuantity('25.5000')).toBe('25.5');
  });

  it('should calculate presentation days remaining without altering classification', () => {
    const upcomingDays = component.calculateDaysRemaining('2026-09-04', '2026-08-21');
    expect(upcomingDays?.isOverdue).toBe(false);
    expect(upcomingDays?.text).toContain('14 days left');

    const overdueDays = component.calculateDaysRemaining('2026-07-23', '2026-08-21');
    expect(overdueDays?.isOverdue).toBe(true);
    expect(overdueDays?.text).toContain('29 days overdue');
  });
});
