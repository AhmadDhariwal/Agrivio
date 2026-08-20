import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BatchesPage } from './batches.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BatchesPage', () => {
  let component: BatchesPage;
  let fixture: ComponentFixture<BatchesPage>;

  const mockBatches = [
    {
      id: 'batch-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      batchNumber: 'LOT-LAMBDA-WH1',
      manufacturingDate: '2027-09-21',
      expiryDate: '2027-09-21',
      firstReceivedAt: '2026-08-17T11:34:00.000Z',
    },
    {
      id: 'batch-2',
      organizationId: 'org-1',
      productId: 'prod-2',
      batchNumber: 'LOT-EMA-2026-02',
      manufacturingDate: '2028-02-08',
      expiryDate: '2028-02-08',
      firstReceivedAt: '2026-08-17T10:00:00.000Z',
    },
  ];

  const mockProducts = [
    {
      id: 'prod-1',
      name: 'Lambda Cyhalothrin 5% EC',
      sku: 'LAMBDA-5EC',
      categoryId: 'cat-1',
      measurementDimension: 'volume',
      baseUnitCode: 'L',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
    {
      id: 'prod-2',
      name: 'Emamectin Benzoate 5% SG',
      sku: 'EMA-5SG',
      categoryId: 'cat-1',
      measurementDimension: 'mass',
      baseUnitCode: 'KG',
      trackingMode: 'batch_expiry',
      status: 'active',
      version: 1,
    },
  ];

  const mockWarehouses = [
    {
      id: 'wh-1',
      organizationId: 'org-1',
      name: 'Faisalabad Main',
      code: 'WH-FSD',
      status: 'active',
      version: 1,
    },
    {
      id: 'wh-2',
      organizationId: 'org-1',
      name: 'Lahore Central',
      code: 'WH-LHE',
      status: 'active',
      version: 1,
    },
  ];

  const mockBalances = [
    {
      id: 'bal-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      batchId: 'batch-1',
      quantityBase: '1250.0000',
      unsellableQuantityBase: '0.0000',
      version: 1,
    },
    {
      id: 'bal-2',
      organizationId: 'org-1',
      warehouseId: 'wh-2',
      productId: 'prod-2',
      batchId: 'batch-2',
      quantityBase: '850.0000',
      unsellableQuantityBase: '0.0000',
      version: 1,
    },
  ];

  const mockExpiry = {
    items: [
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        batchId: 'batch-1',
        quantityBase: '1250.0000',
        classification: 'normal' as const,
        businessDate: '2026-08-20',
        thresholdDays: 30,
      },
    ],
    businessDate: '2026-08-20',
    thresholdDays: 30,
  };

  let lastListBatchesQuery: Record<string, unknown> | null = null;

  beforeEach(async () => {
    lastListBatchesQuery = null;

    await TestBed.configureTestingModule({
      imports: [BatchesPage],
      providers: [
        provideRouter([]),
        {
          provide: InventoryApi,
          useValue: {
            listBatches: (query: Record<string, unknown>) => {
              lastListBatchesQuery = query;
              return of({
                items: mockBatches,
                meta: {
                  page: (query?.['page'] as number) || 1,
                  pageSize: (query?.['pageSize'] as number) || 25,
                  total: 2,
                },
              });
            },
            listBalances: () =>
              of({ items: mockBalances, meta: { page: 1, pageSize: 100, total: 2 } }),
            listExpiry: () => of(mockExpiry),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            searchProductOptions: () => of(mockProducts),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouseOptions: () => of(mockWarehouses),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BatchesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load batches with relation maps', () => {
    expect(component).toBeTruthy();
    expect(component.batches().length).toBe(2);
    expect(component.total()).toBe(2);
    expect(component.productName('prod-1')).toBe('Lambda Cyhalothrin 5% EC');
    expect(component.productSku('prod-1')).toBe('LAMBDA-5EC');
    expect(component.productBaseUnit('prod-1')).toBe('L');
    expect(component.getBatchLocationSummary('batch-1')).toBe('Faisalabad Main');
    expect(component.getBatchTotalQuantity('batch-1').formatted).toBe('1,250');
  });

  it('should handle pagination changes', () => {
    component.onPageChange(2);
    expect(component.page()).toBe(2);
    expect(lastListBatchesQuery?.['page']).toBe(2);

    component.onPageSizeChange(50);
    expect(component.pageSize()).toBe(50);
    expect(component.page()).toBe(1);
    expect(lastListBatchesQuery?.['pageSize']).toBe(50);
  });

  it('should handle debounced search inputs', () => {
    vi.useFakeTimers();
    component.onSearchInput({ target: { value: 'LOT-LAMBDA' } } as unknown as Event);
    vi.advanceTimersByTime(350);
    expect(component.search()).toBe('LOT-LAMBDA');
    expect(lastListBatchesQuery?.['search']).toBe('LOT-LAMBDA');
    vi.useRealTimers();
  });

  it('should handle product and warehouse filter changes', () => {
    component.onProductChange({ target: { value: 'prod-1' } } as unknown as Event);
    expect(component.productFilter()).toBe('prod-1');
    expect(lastListBatchesQuery?.['productId']).toBe('prod-1');

    component.onWarehouseChange({ target: { value: 'wh-1' } } as unknown as Event);
    expect(component.warehouseFilter()).toBe('wh-1');
    expect(lastListBatchesQuery?.['warehouseId']).toBe('wh-1');

    component.clearFilters();
    expect(component.search()).toBe('');
    expect(component.productFilter()).toBe('');
    expect(component.warehouseFilter()).toBe('');
  });

  it('should open and close the Batch Inspector drawer', () => {
    expect(component.selectedBatch()).toBeNull();

    component.openInspector(mockBatches[0]!);
    expect(component.selectedBatch()).toEqual(mockBatches[0]);
    expect(component.technicalDetailsOpen()).toBe(false);

    component.toggleTechnicalDetails();
    expect(component.technicalDetailsOpen()).toBe(true);

    component.closeInspector();
    expect(component.selectedBatch()).toBeNull();
  });

  it('should switch between table and cards view modes', () => {
    expect(component.preferredViewMode()).toBe('table');

    component.setViewMode('cards');
    expect(component.preferredViewMode()).toBe('cards');

    component.setViewMode('table');
    expect(component.preferredViewMode()).toBe('table');
  });

  it('should correctly format dates, quantities, and status badges', () => {
    expect(component.formatDate('2027-09-21')).toMatch(/21 Sep(t)? 2027/);
    expect(component.formatDate(null)).toBe('—');
    expect(component.formatQuantity('1250')).toBe('1,250');
    expect(component.formatQuantity(null)).toBe('0');

    const status = component.getBatchStatus(mockBatches[0]!);
    expect(status.label).toBe('Active');
    expect(status.tone).toBe('green');
  });
});
