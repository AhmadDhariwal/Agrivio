import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReportsPage } from './reports.page';
import { ReportsApi } from '../../data-access/reports.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { UsersAccessApi } from '../../../users-access/data-access/users-access.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { ReportCatalogItem, ReportDataset } from '../../models/reports.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

interface MockReportsApi {
  listCatalog: ReturnType<typeof vi.fn>;
  getReport: ReturnType<typeof vi.fn>;
  exportReport: ReturnType<typeof vi.fn>;
}

interface MockSessionStore {
  hasPermission: ReturnType<typeof vi.fn>;
  session: ReturnType<typeof vi.fn>;
}

interface MockCapabilityService {
  canUseModule: ReturnType<typeof vi.fn>;
  canUseView: ReturnType<typeof vi.fn>;
  canPerformAction: ReturnType<typeof vi.fn>;
}

describe('ReportsPage', () => {
  let component: ReportsPage;
  let fixture: ComponentFixture<ReportsPage>;
  let mockReportsApi: MockReportsApi;
  let mockSessionStore: MockSessionStore;
  let mockCapabilityService: MockCapabilityService;
  let mockBranchesApi: { listBranchOptions: ReturnType<typeof vi.fn>; listWarehouseOptions: ReturnType<typeof vi.fn> };
  let mockCustomersApi: { searchCustomerOptions: ReturnType<typeof vi.fn> };
  let mockSuppliersApi: { searchSupplierOptions: ReturnType<typeof vi.fn> };
  let mockCatalogApi: { searchProductOptions: ReturnType<typeof vi.fn>; listCategories: ReturnType<typeof vi.fn> };
  let mockUsersApi: { listEmployees: ReturnType<typeof vi.fn> };
  let mockAccountsApi: { listAccountOptions: ReturnType<typeof vi.fn> };

  const mockCatalog: ReportCatalogItem[] = [
    {
      key: 'sales',
      title: 'Sales',
      filters: [
        'fromDate',
        'toDate',
        'branchId',
        'warehouseId',
        'customerId',
        'productId',
        'categoryId',
        'customerType',
        'priceTier',
        'paymentStatus',
        'paymentMethod',
        'employeeId',
        'groupBy',
      ],
      required: [],
      exports: ['pdf', 'excel', 'csv'],
    },
    {
      key: 'stock',
      title: 'Stock',
      filters: ['warehouseId', 'productId', 'categoryId'],
      required: [],
      exports: ['pdf', 'excel', 'csv'],
    },
    {
      key: 'customer-ledger',
      title: 'Customer ledger',
      filters: ['customerId', 'fromDate', 'toDate'],
      required: ['customerId'],
      exports: ['pdf', 'excel', 'csv'],
    },
    {
      key: 'supplier-ledger',
      title: 'Supplier ledger',
      filters: ['supplierId', 'fromDate', 'toDate'],
      required: ['supplierId'],
      exports: ['pdf', 'excel', 'csv'],
    },
  ];

  const mockSalesDataset: ReportDataset = {
    reportKey: 'sales',
    title: 'Sales',
    columns: [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'saleDate', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'total', label: 'Total' },
      { key: 'cogs', label: 'COGS' },
    ],
    rows: [
      {
        id: 's1',
        invoiceNumber: 'INV-001',
        saleDate: '2026-08-01',
        customer: 'Kisan Dost',
        total: '75000.00',
        cogs: '50000.00',
      },
      {
        id: 's2',
        invoiceNumber: 'INV-002',
        saleDate: '2026-08-02',
        customer: 'Ali Farms',
        total: '25000.00',
        cogs: '18000.00',
      },
    ],
    totals: {
      total: '100000.00',
    },
    filters: {
      groupBy: 'document',
    },
  };

  function recreateComponent(): void {
    fixture.destroy();
    fixture = TestBed.createComponent(ReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mockReportsApi = {
      listCatalog: vi.fn().mockReturnValue(of(mockCatalog)),
      getReport: vi.fn().mockReturnValue(of(mockSalesDataset)),
      exportReport: vi.fn().mockReturnValue(of(new Blob(['test'], { type: 'application/pdf' }))),
    };

    mockSessionStore = {
      hasPermission: vi.fn().mockReturnValue(true),
      session: vi.fn().mockReturnValue({ subscriptionAccessState: { status: 'active' } }),
    };

    mockCapabilityService = {
      canUseModule: vi.fn().mockReturnValue(true),
      canUseView: vi.fn().mockReturnValue(true),
      canPerformAction: vi.fn().mockReturnValue(true),
    };

    mockBranchesApi = {
      listBranchOptions: vi.fn().mockReturnValue(of([{ id: 'br-1', name: 'Main Branch', code: 'MB' }])),
      listWarehouseOptions: vi.fn().mockReturnValue(of([{ id: 'wh-1', name: 'Main Warehouse', code: 'MW' }])),
    };

    mockCustomersApi = {
      searchCustomerOptions: vi.fn().mockReturnValue(of([{ id: 'cust-1', name: 'Kisan Dost', phone: '03001234567' }])),
    };

    mockSuppliersApi = {
      searchSupplierOptions: vi.fn().mockReturnValue(of([{ id: 'sup-1', name: 'Engro Fertilizers' }])),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn().mockReturnValue(of([{ id: 'prod-1', name: 'Urea 50kg', sku: 'UREA-50' }])),
      listCategories: vi.fn().mockReturnValue(of({ items: [{ id: 'cat-1', name: 'Fertilizers' }], meta: { total: 1 } })),
    };

    mockUsersApi = {
      listEmployees: vi.fn().mockReturnValue(of({ items: [{ id: 'emp-1', displayName: 'Tariq Mehmood', role: 'Owner' }], meta: { total: 1 } })),
    };

    mockAccountsApi = {
      listAccountOptions: vi.fn().mockReturnValue(of([{ id: 'acc-1', name: 'Main Cash', accountType: 'cash' }])),
    };

    await TestBed.configureTestingModule({
      imports: [ReportsPage],
      providers: [
        { provide: ReportsApi, useValue: mockReportsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: mockCapabilityService },
        { provide: BranchesWarehousesApi, useValue: mockBranchesApi },
        { provide: CustomersApi, useValue: mockCustomersApi },
        { provide: SuppliersApi, useValue: mockSuppliersApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: UsersAccessApi, useValue: mockUsersApi },
        { provide: AccountsApi, useValue: mockAccountsApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes and loads report catalog', () => {
    expect(component).toBeTruthy();
    expect(mockReportsApi.listCatalog).toHaveBeenCalled();
    expect(component.catalog().length).toBe(4);
    expect(component.selectedKey()).toBe('sales');
    expect(component.filters()['groupBy']).toBe('document');
  });

  it('separates required and optional filters dynamically based on selected report', () => {
    // Sales has no required filters
    expect(component.requiredFilters()).toEqual([]);
    expect(component.optionalFilters().length).toBe(13);

    // Switch to Customer Ledger
    component.onReportChange('customer-ledger');
    expect(component.requiredFilters()).toEqual(['customerId']);
    expect(component.optionalFilters()).toEqual(['fromDate', 'toDate']);

    // Switch to Stock
    component.onReportChange('stock');
    expect(component.requiredFilters()).toEqual([]);
    expect(component.optionalFilters()).toEqual(['warehouseId', 'productId', 'categoryId']);
  });

  it('removes stale hidden filters when switching report families', () => {
    // Set a customer ID while on customer-ledger
    component.onReportChange('customer-ledger');
    component.setFilter('customerId', 'cust-1');
    expect(component.filters()['customerId']).toBe('cust-1');

    // Switch to Stock (which does not support customerId)
    component.onReportChange('stock');
    expect(component.filters()['customerId']).toBeUndefined();
  });

  it('validates required filters before allowing Run', () => {
    // Switch to customer ledger (requires customerId)
    component.onReportChange('customer-ledger');
    expect(component.canRunReport()).toBe(false);

    // Set customerId
    component.setFilter('customerId', 'cust-1');
    expect(component.canRunReport()).toBe(true);

    // Invalid date range
    component.setFilter('fromDate', '2026-08-10');
    component.setFilter('toDate', '2026-08-01');
    expect(component.canRunReport()).toBe(false);

    component.setFilter('toDate', '2026-08-15');
    expect(component.canRunReport()).toBe(true);
  });

  it('runs report and populates dataset with clean parameters', () => {
    component.setFilter('branchId', 'br-1');
    component.run();

    expect(mockReportsApi.getReport).toHaveBeenCalledWith('sales', {
      branchId: 'br-1',
      groupBy: 'document',
    });
    expect(component.dataset()).toEqual(mockSalesDataset);
    expect(component.totalRows()).toBe(2);
    expect(component.hasAuthoritativeTotals()).toBe(true);
    expect(component.authoritativeTotalsList().length).toBe(1);
    expect(component.authoritativeTotalsList()[0]?.formattedValue).toContain('100,000.00');
  });

  it('triggers export with format and applicable filters', () => {
    component.setFilter('branchId', 'br-1');
    component.exportFormat('pdf');

    expect(mockReportsApi.exportReport).toHaveBeenCalledWith('sales', 'pdf', {
      branchId: 'br-1',
      groupBy: 'document',
    });
  });

  it('resets filters back to authoritative defaults', () => {
    component.setFilter('branchId', 'br-1');
    component.setFilter('fromDate', '2026-08-01');
    component.resetFilters();

    expect(component.filters()['branchId']).toBeUndefined();
    expect(component.filters()['fromDate']).toBeUndefined();
    expect(component.filters()['groupBy']).toBe('document');
    expect(component.dataset()).toBeNull();
  });

  it('removes only disabled report families from selection and blocks direct selection', () => {
    mockCapabilityService.canUseView.mockImplementation(
      (key: string) => key !== 'reports.reportAvailability.sales',
    );
    recreateComponent();

    expect(component.availableCatalog().map((item) => item.key)).toEqual([
      'stock',
      'customer-ledger',
      'supplier-ledger',
    ]);
    expect(component.selectedKey()).toBe('stock');
    component.onReportChange('sales');
    expect(component.selectedKey()).toBe('stock');
    expect(fixture.nativeElement.querySelector('option[value="sales"]')).toBeNull();
  });

  it('gates Run and each export format independently', () => {
    mockCapabilityService.canPerformAction.mockImplementation(
      (key: string) =>
        key !== 'reports.actions.run' && key !== 'reports.actions.exportPdf',
    );
    recreateComponent();
    mockReportsApi.getReport.mockClear();
    mockReportsApi.exportReport.mockClear();

    expect(component.canRunAction()).toBe(false);
    component.run();
    expect(mockReportsApi.getReport).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="report-run"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="export-pdf"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="export-excel"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="export-csv"]')).toBeTruthy();

    component.exportFormat('pdf');
    expect(mockReportsApi.exportReport).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('not available for your organization');
  });
});
