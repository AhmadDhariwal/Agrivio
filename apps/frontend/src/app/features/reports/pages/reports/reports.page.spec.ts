import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  let mockCatalogApi: {
    searchProductOptions: ReturnType<typeof vi.fn>;
    searchCategoryOptions: ReturnType<typeof vi.fn>;
  };
  let mockUsersApi: { listEmployees: ReturnType<typeof vi.fn> };
  let mockAccountsApi: { searchAccountOptions: ReturnType<typeof vi.fn> };

  const mockStockDataset: ReportDataset = {
    reportKey: 'stock',
    title: 'Stock',
    columns: [
      { key: 'warehouseName', label: 'Warehouse' },
      { key: 'productName', label: 'Product' },
      { key: 'quantityBase', label: 'Quantity' },
    ],
    rows: [
      {
        warehouseName: 'Main Warehouse (MW)',
        productName: 'Urea 50kg',
        quantityBase: '10.0000',
      },
    ],
    totals: {},
    filters: {},
  };

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
      searchCustomerOptions: vi.fn().mockImplementation((query: string) =>
        of([
          {
            id: query === 'beyond-page' ? 'cust-99' : 'cust-1',
            name: query === 'beyond-page' ? 'Far Page Customer' : 'Kisan Dost',
            phone: '03001234567',
          },
        ]),
      ),
    };

    mockSuppliersApi = {
      searchSupplierOptions: vi.fn().mockReturnValue(of([{ id: 'sup-1', name: 'Engro Fertilizers' }])),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn().mockReturnValue(of([{ id: 'prod-1', name: 'Urea 50kg', sku: 'UREA-50' }])),
      searchCategoryOptions: vi.fn().mockImplementation((query: string) =>
        of([
          {
            id: query === 'beyond-page' ? 'cat-99' : 'cat-1',
            name: query === 'beyond-page' ? 'Far Page Category' : 'Fertilizers',
          },
        ]),
      ),
    };

    mockUsersApi = {
      listEmployees: vi.fn().mockImplementation(({ search }: { search?: string } = {}) =>
        of({
          items: [
            {
              id: search === 'beyond-page' ? 'emp-99' : 'emp-1',
              displayName: search === 'beyond-page' ? 'Far Page Employee' : 'Tariq Mehmood',
              role: 'Owner',
            },
          ],
          meta: { total: 1 },
        }),
      ),
    };

    mockAccountsApi = {
      searchAccountOptions: vi.fn().mockReturnValue(of([{ id: 'acc-1', name: 'Main Cash', accountType: 'cash' }])),
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

  it('renders authoritative backend display names without selector-map fallback', () => {
    component.onReportChange('stock');
    mockReportsApi.getReport.mockReturnValue(of(mockStockDataset));
    component.run();
    fixture.detectChanges();

    expect(component.formatCellValue('productName', 'Urea 50kg')).toBe('Urea 50kg');
    expect(component.formatCellValue('warehouseName', 'Main Warehouse (MW)')).toBe(
      'Main Warehouse (MW)',
    );
    const table = fixture.nativeElement.querySelector('[data-testid="report-table"]');
    expect(table?.textContent).toContain('Urea 50kg');
    expect(table?.textContent).not.toContain('prod-1');
  });

  it('formats report date-only and instant timestamp columns accurately', () => {
    // Calendar dates - date only
    expect(component.formatCellValue('saleDate', '2026-09-20')).toBe('20 Sep 2026');
    expect(component.formatCellValue('purchaseDate', '2026-08-24')).toBe('24 Aug 2026');
    expect(component.formatCellValue('expenseDate', '2026-07-15')).toBe('15 Jul 2026');
    expect(component.formatCellValue('groupLabel', '2026-09-20')).toBe('20 Sep 2026');

    // Instant timestamps - date + time in local timezone
    const timestampFormatted = component.formatCellValue('postedAt', '2026-09-20T15:56:48.000Z');
    expect(timestampFormatted).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} (AM|PM)$/);

    // Missing / invalid
    expect(component.formatCellValue('saleDate', null)).toBe('—');
    expect(component.formatCellValue('postedAt', '')).toBe('—');
  });

  it('bootstraps customer filter with bounded initial search', async () => {
    mockCustomersApi.searchCustomerOptions.mockClear();
    component.onReportChange('customer-ledger');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mockCustomersApi.searchCustomerOptions).toHaveBeenCalledWith('');
  });

  it('debounces customer filter search and reaches records beyond the initial page', async () => {
    component.onReportChange('customer-ledger');
    await new Promise((resolve) => setTimeout(resolve, 350));
    mockCustomersApi.searchCustomerOptions.mockClear();

    const input = document.createElement('input');
    input.value = 'beyond-page';
    component.onCustomerSearch({ target: input } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mockCustomersApi.searchCustomerOptions).toHaveBeenCalledTimes(1);
    expect(mockCustomersApi.searchCustomerOptions).toHaveBeenCalledWith('beyond-page');
    expect(component.customers()[0]?.name).toBe('Far Page Customer');
  });

  it('uses bounded product search for report filters', async () => {
    component.onReportChange('stock');
    await new Promise((resolve) => setTimeout(resolve, 350));
    mockCatalogApi.searchProductOptions.mockClear();

    const input = document.createElement('input');
    input.value = 'urea';
    component.onProductSearch({ target: input } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledWith('urea', 25, 'active');
    expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledTimes(1);
  });

  it('uses bounded category search for report filters', async () => {
    component.onReportChange('stock');
    await new Promise((resolve) => setTimeout(resolve, 350));
    mockCatalogApi.searchCategoryOptions.mockClear();

    const input = document.createElement('input');
    input.value = 'beyond-page';
    component.onCategorySearch({ target: input } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(mockCatalogApi.searchCategoryOptions).toHaveBeenCalledWith('beyond-page');
    expect(mockCatalogApi.searchCategoryOptions).toHaveBeenCalledTimes(1);
    expect(component.categories()[0]?.name).toBe('Far Page Category');
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

  describe('Phase 4 Reporting Suite', () => {
    const phase4Catalog: ReportCatalogItem[] = [
      ...mockCatalog,
      {
        key: 'financial-position',
        title: 'Financial Position',
        filters: ['asOf'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'daily-cash-position',
        title: 'Daily Cash Position',
        filters: ['businessDate'],
        required: ['businessDate'],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'account-statement',
        title: 'Account Statement',
        filters: ['accountId', 'fromDate', 'toDate', 'sourceType', 'direction', 'search', 'page', 'pageSize'],
        required: ['accountId'],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'cash-book',
        title: 'Cash Book',
        filters: ['fromDate', 'toDate', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'bank-book',
        title: 'Bank Book',
        filters: ['fromDate', 'toDate', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'account-transfers',
        title: 'Account Transfers',
        filters: ['fromDate', 'toDate', 'accountId', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'treasury-movements',
        title: 'Treasury Movements',
        filters: ['fromDate', 'toDate', 'accountId', 'accountType', 'sourceType', 'direction', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'manual-adjustments',
        title: 'Manual Financial Adjustments',
        filters: ['fromDate', 'toDate', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'customer-loans',
        title: 'Customer Loans',
        filters: ['customerId', 'fromDate', 'toDate', 'dueDateFrom', 'dueDateTo', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'supplier-refunds',
        title: 'Supplier Refunds',
        filters: ['supplierId', 'accountId', 'fromDate', 'toDate', 'search', 'page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
      {
        key: 'financial-reconciliation',
        title: 'Financial Reconciliation',
        filters: ['page', 'pageSize'],
        required: [],
        exports: ['pdf', 'excel', 'csv'],
      },
    ];

    const mockFinancialPositionDataset: ReportDataset = {
      reportKey: 'financial-position',
      title: 'Financial Position',
      asOf: '2026-09-24T18:00:00.000Z',
      liquidPosition: {
        cashInHand: { amount: '150000.00', currency: 'PKR' },
        bankBalances: { amount: '450000.00', currency: 'PKR' },
        otherLiquidAccounts: { amount: '25000.00', currency: 'PKR' },
        otherLiquid: { amount: '25000.00', currency: 'PKR' },
        totalLiquidFunds: { amount: '625000.00', currency: 'PKR' },
      },
      customerPosition: {
        tradeReceivable: { amount: '350000.00', currency: 'PKR' },
        customerLoanReceivable: { amount: '120000.00', currency: 'PKR' },
        customerAdvance: { amount: '50000.00', currency: 'PKR' },
        netTradeExposure: { amount: '420000.00', currency: 'PKR' },
        netExposure: { amount: '420000.00', currency: 'PKR' },
        totalCustomerExposure: { amount: '420000.00', currency: 'PKR' },
      },
      supplierPosition: {
        supplierPayable: { amount: '200000.00', currency: 'PKR' },
        supplierAdvance: { amount: '30000.00', currency: 'PKR' },
        netSupplierPayable: { amount: '170000.00', currency: 'PKR' },
      },
      rows: [],
      totals: {},
      filters: {},
    };

    const mockDailyCashDataset: ReportDataset = {
      reportKey: 'daily-cash-position',
      title: 'Daily Cash Position',
      businessDate: '2026-09-24',
      openingLiquidFunds: { amount: '500000.00', currency: 'PKR' },
      businessExternalInflows: { amount: '150000.00', currency: 'PKR' },
      manualExternalInflows: { amount: '10000.00', currency: 'PKR' },
      businessExternalOutflows: { amount: '80000.00', currency: 'PKR' },
      manualExternalOutflows: { amount: '5000.00', currency: 'PKR' },
      accountBalanceAdjustments: { amount: '2000.00', currency: 'PKR' },
      internalTransfers: { amount: '50000.00', currency: 'PKR' },
      internalTransferNet: { amount: '0.00', currency: 'PKR' },
      closingLiquidFunds: { amount: '577000.00', currency: 'PKR' },
      unclassifiedTreasury: {
        inflow: { amount: '10000.00', currency: 'PKR' },
        outflow: { amount: '5000.00', currency: 'PKR' },
        net: { amount: '5000.00', currency: 'PKR' },
        unclassifiedInflows: { amount: '10000.00', currency: 'PKR' },
        unclassifiedOutflows: { amount: '5000.00', currency: 'PKR' },
        netUnclassifiedTreasuryMovement: { amount: '5000.00', currency: 'PKR' },
      },
      reconciliation: {
        status: 'Reconciled',
        expectedClosing: { amount: '577000.00', currency: 'PKR' },
        difference: { amount: '0.00', currency: 'PKR' },
        calculatedClosing: { amount: '577000.00', currency: 'PKR' },
        reconciled: true,
      },
      rows: [
        {
          category: 'Customer Payments',
          type: 'inflow',
          amount: { amount: '120000.00', currency: 'PKR' },
          count: 5,
        },
        {
          category: 'Internal Transfers',
          type: 'internal',
          amount: { amount: '50000.00', currency: 'PKR' },
          count: 2,
        },
      ],
      totals: {},
      filters: { businessDate: '2026-09-24' },
    };

    const mockAccountStatementDataset: ReportDataset = {
      reportKey: 'account-statement',
      title: 'Account Statement',
      openingBalance: { amount: '100000.00', currency: 'PKR' },
      periodInflow: { amount: '50000.00', currency: 'PKR' },
      periodOutflow: { amount: '20000.00', currency: 'PKR' },
      periodNetChange: { amount: '30000.00', currency: 'PKR' },
      closingBalance: { amount: '130000.00', currency: 'PKR' },
      rows: [
        {
          id: 'mov-1',
          businessDate: '2026-09-24',
          postedAt: '2026-09-24T10:30:00.000Z',
          sourceType: 'customer_payment',
          reference: 'REC-001',
          description: 'Customer Payment - Kisan Dost',
          direction: 'inflow',
          inflowAmount: { amount: '50000.00', currency: 'PKR' },
          outflowAmount: null,
          runningBalance: { amount: '150000.00', currency: 'PKR' },
          status: 'posted',
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockTransfersDataset: ReportDataset = {
      reportKey: 'account-transfers',
      title: 'Account Transfers',
      rows: [
        {
          id: 'tr-1',
          businessDate: '2026-09-24',
          fromAccount: { id: 'acc-1', name: 'Main Cash' },
          toAccount: { id: 'acc-2', name: 'HBL Operational' },
          amount: { amount: '25000.00', currency: 'PKR' },
          reference: 'TR-2026-001',
          status: 'posted',
          createdBy: 'Tariq Mehmood',
          reversal: null,
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockTreasuryMovementsDataset: ReportDataset = {
      reportKey: 'treasury-movements',
      title: 'Treasury Movements',
      unclassifiedTreasury: {
        inflow: { amount: '10000.00', currency: 'PKR' },
        outflow: { amount: '0.00', currency: 'PKR' },
        net: { amount: '10000.00', currency: 'PKR' },
        unclassifiedInflows: { amount: '10000.00', currency: 'PKR' },
        unclassifiedOutflows: { amount: '0.00', currency: 'PKR' },
        netUnclassifiedTreasuryMovement: { amount: '10000.00', currency: 'PKR' },
      },
      rows: [
        {
          id: 'mov-1',
          businessDate: '2026-09-24',
          accountName: 'Main Cash',
          accountType: 'cash',
          sourceType: 'manual_external_inflow',
          reference: 'EXT-001',
          inflowAmount: { amount: '10000.00', currency: 'PKR' },
          outflowAmount: null,
          status: 'posted',
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockManualAdjustmentsDataset: ReportDataset = {
      reportKey: 'manual-adjustments',
      title: 'Manual Financial Adjustments',
      rows: [
        {
          id: 'adj-1',
          businessDate: '2026-09-24',
          domain: 'customer',
          entity: { id: 'cust-1', name: 'Kisan Dost' },
          balanceType: 'trade_receivable',
          beforeAmount: null,
          delta: { amount: '500.00', currency: 'PKR' },
          afterAmount: null,
          reason: 'Balance adjustment',
          reference: 'ADJ-001',
          createdBy: 'Owner',
          status: 'posted',
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockCustomerLoansDataset: ReportDataset = {
      reportKey: 'customer-loans',
      title: 'Customer Loans',
      rows: [
        {
          id: 'loan-1',
          customerName: 'Kisan Dost',
          loanDate: '2026-09-24',
          reference: 'LN-001',
          principal: { amount: '100000.00', currency: 'PKR' },
          repaid: { amount: '25000.00', currency: 'PKR' },
          outstanding: { amount: '75000.00', currency: 'PKR' },
          dueDate: '2026-12-31',
          status: 'open',
          disbursementAccount: { id: 'acc-1', name: 'Main Cash' },
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockSupplierRefundsDataset: ReportDataset = {
      reportKey: 'supplier-refunds',
      title: 'Supplier Refunds',
      rows: [
        {
          id: 'ref-1',
          supplierName: 'Engro Fertilizers',
          refundDate: '2026-09-24',
          reference: 'RF-001',
          amount: { amount: '15000.00', currency: 'PKR' },
          accountName: 'HBL Operational',
          status: 'posted',
          reversalOfId: null,
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: {},
    };

    const mockReconciliationHealthyDataset: ReportDataset = {
      reportKey: 'financial-reconciliation',
      title: 'Financial Reconciliation',
      status: 'Reconciled',
      checks: [
        { code: 'CUSTOMER_ADVANCE_NON_NEGATIVE', status: 'Reconciled' },
        { code: 'SUPPLIER_ADVANCE_NON_NEGATIVE', status: 'Reconciled' },
        { code: 'ACCOUNT_TRANSFER_LEGS', status: 'Reconciled' },
        { code: 'TRANSFER_REVERSAL_LEGS', status: 'Reconciled' },
        { code: 'CUSTOMER_LOAN_LEDGER', status: 'Not Checked', reason: 'Bulk comparison unavailable' },
      ],
      rows: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      totals: { findings: 0 },
    };

    const mockReconciliationMismatchDataset: ReportDataset = {
      reportKey: 'financial-reconciliation',
      title: 'Financial Reconciliation',
      status: 'Needs Review',
      checks: [
        { code: 'CUSTOMER_ADVANCE_NON_NEGATIVE', status: 'Mismatch Detected' },
        { code: 'SUPPLIER_ADVANCE_NON_NEGATIVE', status: 'Reconciled' },
        { code: 'CUSTOMER_LOAN_LEDGER', status: 'Not Checked', reason: 'Bulk comparison unavailable' },
      ],
      rows: [
        {
          code: 'CUSTOMER_ADVANCE_NEGATIVE',
          severity: 'error',
          domain: 'customer',
          reference: 'cust-1',
          expected: '>= 0',
          actual: '-500.00',
          difference: '-500.00',
          remediation: 'Review customer advance effects and correction lineage.',
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      totals: { findings: 1 },
    };

    beforeEach(() => {
      mockCapabilityService.canUseModule.mockReturnValue(true);
      mockCapabilityService.canUseView.mockReturnValue(true);
      mockCapabilityService.canPerformAction.mockReturnValue(true);
      mockSessionStore.hasPermission.mockReturnValue(true);
      component.catalog.set(phase4Catalog);
    });

    it('1. renders Financial Position view with titled cards and never Balance Sheet', () => {
      component.onReportChange('financial-position');
      mockReportsApi.getReport.mockReturnValue(of(mockFinancialPositionDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="financial-position-view"]');
      expect(view).toBeTruthy();

      const title = fixture.nativeElement.querySelector('[data-testid="financial-position-title"]');
      expect(title?.textContent).toContain('Financial Position');
      expect(fixture.nativeElement.textContent).not.toContain('Balance Sheet');
    });

    it('2. displays liquid totals strictly from backend values', () => {
      component.onReportChange('financial-position');
      mockReportsApi.getReport.mockReturnValue(of(mockFinancialPositionDataset));
      component.run();
      fixture.detectChanges();

      const totalLiquid = fixture.nativeElement.querySelector('[data-testid="card-total-liquid"]');
      expect(totalLiquid?.textContent).toContain('625,000.00');

      const cashInHand = fixture.nativeElement.querySelector('[data-testid="card-cash-in-hand"]');
      expect(cashInHand?.textContent).toContain('150,000.00');

      const bankBalances = fixture.nativeElement.querySelector('[data-testid="card-bank-balances"]');
      expect(bankBalances?.textContent).toContain('450,000.00');
    });

    it('3. displays customer position values authoritatively from backend', () => {
      component.onReportChange('financial-position');
      mockReportsApi.getReport.mockReturnValue(of(mockFinancialPositionDataset));
      component.run();
      fixture.detectChanges();

      const customerExposure = fixture.nativeElement.querySelector('[data-testid="card-total-customer-exposure"]');
      expect(customerExposure?.textContent).toContain('420,000.00');

      const tradeReceivable = fixture.nativeElement.querySelector('[data-testid="card-trade-receivable"]');
      expect(tradeReceivable?.textContent).toContain('350,000.00');

      const loanReceivable = fixture.nativeElement.querySelector('[data-testid="card-customer-loan"]');
      expect(loanReceivable?.textContent).toContain('120,000.00');
    });

    it('4. displays supplier position values authoritatively from backend', () => {
      component.onReportChange('financial-position');
      mockReportsApi.getReport.mockReturnValue(of(mockFinancialPositionDataset));
      component.run();
      fixture.detectChanges();

      const netSupplierPayable = fixture.nativeElement.querySelector('[data-testid="card-net-supplier-payable"]');
      expect(netSupplierPayable?.textContent).toContain('170,000.00');

      const supplierPayable = fixture.nativeElement.querySelector('[data-testid="card-supplier-payable"]');
      expect(supplierPayable?.textContent).toContain('200,000.00');

      const supplierAdvance = fixture.nativeElement.querySelector('[data-testid="card-supplier-advance"]');
      expect(supplierAdvance?.textContent).toContain('30,000.00');
    });

    it('5. renders Daily Cash Position with opening, inflows, outflows, and closing', () => {
      component.onReportChange('daily-cash-position');
      mockReportsApi.getReport.mockReturnValue(of(mockDailyCashDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="daily-cash-position-view"]');
      expect(view).toBeTruthy();

      const openingCard = fixture.nativeElement.querySelector('[data-testid="card-opening-liquid"]');
      expect(openingCard?.textContent).toContain('500,000.00');

      const closingCard = fixture.nativeElement.querySelector('[data-testid="card-closing-liquid"]');
      expect(closingCard?.textContent).toContain('577,000.00');
    });

    it('6. presents internal transfers separately and explains they do not change liquid funds', () => {
      component.onReportChange('daily-cash-position');
      mockReportsApi.getReport.mockReturnValue(of(mockDailyCashDataset));
      component.run();
      fixture.detectChanges();

      const transfersCard = fixture.nativeElement.querySelector('[data-testid="card-internal-transfers"]');
      expect(transfersCard?.textContent).toContain('50,000.00');

      const notice = fixture.nativeElement.querySelector('[data-testid="transfer-notice"]');
      expect(notice?.textContent).toContain('Internal transfers move money between Agrivio accounts and do not change Total Liquid Funds.');
    });

    it('7. confirms internal transfer net is zero and not counted as external cash flow', () => {
      component.onReportChange('daily-cash-position');
      mockReportsApi.getReport.mockReturnValue(of(mockDailyCashDataset));
      component.run();
      fixture.detectChanges();

      const transfersCard = fixture.nativeElement.querySelector('[data-testid="card-internal-transfers"]');
      expect(transfersCard?.textContent).toContain('Net impact: PKR 0.00');
    });

    it('8. displays Unclassified Treasury with mandatory explanation and not as an asset', () => {
      component.onReportChange('daily-cash-position');
      mockReportsApi.getReport.mockReturnValue(of(mockDailyCashDataset));
      component.run();
      fixture.detectChanges();

      const unclassifiedCard = fixture.nativeElement.querySelector('[data-testid="unclassified-treasury-card"]');
      expect(unclassifiedCard).toBeTruthy();
      expect(unclassifiedCard?.textContent).toContain('Unclassified treasury activity represents manual money movements whose business source was not categorized');
      expect(fixture.nativeElement.textContent).not.toContain('Unclassified Funds =');
    });

    it('9. renders Account Statement summary cards with opening, inflows, outflows, and closing', () => {
      component.onReportChange('account-statement');
      component.setFilter('accountId', 'acc-1');
      mockReportsApi.getReport.mockReturnValue(of(mockAccountStatementDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="account-statement-view"]');
      expect(view).toBeTruthy();

      const summaryGrid = fixture.nativeElement.querySelector('[data-testid="statement-summary-cards"]');
      expect(summaryGrid?.textContent).toContain('100,000.00'); // opening
      expect(summaryGrid?.textContent).toContain('50,000.00');  // inflow
      expect(summaryGrid?.textContent).toContain('20,000.00');  // outflow
      expect(summaryGrid?.textContent).toContain('130,000.00'); // closing
    });

    it('10. enforces accountId requirement and handles statement server-side pagination', () => {
      component.onReportChange('account-statement');
      expect(component.requiredFilters()).toContain('accountId');
      expect(component.canRunReport()).toBe(false);

      component.setFilter('accountId', 'acc-1');
      expect(component.canRunReport()).toBe(true);

      mockReportsApi.getReport.mockReturnValue(of(mockAccountStatementDataset));
      component.onServerPageChange(2);
      expect(mockReportsApi.getReport).toHaveBeenCalledWith('account-statement', expect.objectContaining({
        accountId: 'acc-1',
        page: '2',
      }));
    });

    it('11. renders Account Transfers with single business row semantics', () => {
      component.onReportChange('account-transfers');
      mockReportsApi.getReport.mockReturnValue(of(mockTransfersDataset));
      component.run();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[data-testid="account-transfers-table"]');
      expect(table).toBeTruthy();

      const rows = fixture.nativeElement.querySelectorAll('.transfer-row');
      expect(rows.length).toBe(1);
      expect(rows[0]?.textContent).toContain('Main Cash');
      expect(rows[0]?.textContent).toContain('HBL Operational');
      expect(rows[0]?.textContent).toContain('25,000.00');
    });

    it('12. humanizes Treasury Movement source names accurately', () => {
      component.onReportChange('treasury-movements');
      mockReportsApi.getReport.mockReturnValue(of(mockTreasuryMovementsDataset));
      component.run();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[data-testid="treasury-movements-table"]');
      expect(table).toBeTruthy();
      expect(table?.textContent).toContain('External Money Added');
    });

    it('13. renders Manual Adjustments cross-domain table', () => {
      component.onReportChange('manual-adjustments');
      mockReportsApi.getReport.mockReturnValue(of(mockManualAdjustmentsDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="manual-adjustments-view"]');
      expect(view).toBeTruthy();

      const row = fixture.nativeElement.querySelector('.adjustment-row');
      expect(row?.textContent).toContain('Customer');
      expect(row?.textContent).toContain('Kisan Dost');
      expect(row?.textContent).toContain('Customer Trade Receivable Adjustment');
    });

    it('14. displays dash safely when before/after amounts are null in adjustments', () => {
      component.onReportChange('manual-adjustments');
      mockReportsApi.getReport.mockReturnValue(of(mockManualAdjustmentsDataset));
      component.run();
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('.adjustment-row');
      const nullBefore = row?.querySelector('[data-testid="null-before-placeholder"]');
      const nullAfter = row?.querySelector('[data-testid="null-after-placeholder"]');
      expect(nullBefore?.textContent?.trim()).toBe('—');
      expect(nullAfter?.textContent?.trim()).toBe('—');
    });

    it('15. renders Customer Loans Report with all required columns and authoritative values', () => {
      component.onReportChange('customer-loans');
      mockReportsApi.getReport.mockReturnValue(of(mockCustomerLoansDataset));
      component.run();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[data-testid="customer-loans-table"]');
      expect(table).toBeTruthy();

      const row = fixture.nativeElement.querySelector('[data-testid="loan-row-loan-1"]');
      expect(row?.textContent).toContain('Kisan Dost');
      expect(row?.textContent).toContain('LN-001');
      expect(row?.textContent).toContain('100,000.00'); // principal
      expect(row?.textContent).toContain('25,000.00');  // repaid
      expect(row?.textContent).toContain('75,000.00');  // outstanding
      expect(row?.textContent).toContain('Main Cash');
    });

    it('16. renders Supplier Refunds as treasury recovery and never labels as income', () => {
      component.onReportChange('supplier-refunds');
      mockReportsApi.getReport.mockReturnValue(of(mockSupplierRefundsDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="supplier-refunds-report-view"]');
      expect(view).toBeTruthy();

      const notice = fixture.nativeElement.querySelector('[data-testid="refund-notice"]');
      expect(notice?.textContent).toContain('Supplier refunds are treasury balance recoveries');
      expect(notice?.textContent).toContain('not counted as sales or operating income');

      const table = fixture.nativeElement.querySelector('[data-testid="supplier-refunds-table"]');
      expect(table?.textContent).toContain('+ Inflow');
      expect(table?.textContent).toContain('15,000.00');
      expect(table?.textContent).not.toContain('Income');
    });

    it('17. renders Reconciliation healthy state with counts and no mismatches banner', () => {
      component.onReportChange('financial-reconciliation');
      mockReportsApi.getReport.mockReturnValue(of(mockReconciliationHealthyDataset));
      component.run();
      fixture.detectChanges();

      const view = fixture.nativeElement.querySelector('[data-testid="reconciliation-report-view"]');
      expect(view).toBeTruthy();

      const reconciledCard = fixture.nativeElement.querySelector('[data-testid="reconciled-count-card"]');
      expect(reconciledCard?.textContent).toContain('4');

      const mismatchCard = fixture.nativeElement.querySelector('[data-testid="mismatches-count-card"]');
      expect(mismatchCard?.textContent).toContain('0');

      const noFindings = fixture.nativeElement.querySelector('[data-testid="no-findings-banner"]');
      expect(noFindings?.textContent).toContain('No Mismatches Detected');
    });

    it('18. renders Reconciliation mismatch state with findings table and remediation', () => {
      component.onReportChange('financial-reconciliation');
      mockReportsApi.getReport.mockReturnValue(of(mockReconciliationMismatchDataset));
      component.run();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[data-testid="reconciliation-findings-table"]');
      expect(table).toBeTruthy();
      expect(table?.textContent).toContain('Review customer advance effects and correction lineage.');
      expect(table?.textContent).toContain('-500.00');
    });

    it('19. shows neutral Not Checked badge and never green for unverified checks', () => {
      component.onReportChange('financial-reconciliation');
      mockReportsApi.getReport.mockReturnValue(of(mockReconciliationHealthyDataset));
      component.run();
      fixture.detectChanges();

      const checkItem = fixture.nativeElement.querySelector('[data-testid="check-CUSTOMER_LOAN_LEDGER"]');
      expect(checkItem).toBeTruthy();
      expect(checkItem?.textContent).toContain('Not Checked');
      const badge = checkItem?.querySelector('.check-badge');
      expect(badge?.classList.contains('badge-reconciled')).toBe(false);
      expect(badge?.classList.contains('badge-not_checked')).toBe(true);
    });

    it('20. enforces diagnostic mode with no automatic Fix All button', () => {
      component.onReportChange('financial-reconciliation');
      mockReportsApi.getReport.mockReturnValue(of(mockReconciliationMismatchDataset));
      component.run();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Fix All');
      expect(fixture.nativeElement.querySelector('button[data-testid="fix-all-btn"]')).toBeNull();
    });

    it('21. reuses cached accounts for account selector with zero redundant HTTP requests', async () => {
      mockAccountsApi.searchAccountOptions.mockClear();
      component.onReportChange('account-statement');
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(component.accountOptions().length).toBe(1);
      expect(component.accountOptions()[0]?.label).toBe('Main Cash');
      expect(mockAccountsApi.searchAccountOptions).toHaveBeenCalledTimes(1);

      // Subsequent access uses local cache
      const options = component.accountOptions();
      expect(options.length).toBe(1);
      expect(mockAccountsApi.searchAccountOptions).toHaveBeenCalledTimes(1);
    });

    it('22. resets page to 1 when a filter is changed', () => {
      component.page.set(3);
      component.setFilter('search', 'voucher');
      expect(component.page()).toBe(1);
    });

    it('23. handles empty states gracefully across Phase 4 reports', () => {
      component.onReportChange('account-transfers');
      mockReportsApi.getReport.mockReturnValue(of({
        reportKey: 'account-transfers',
        title: 'Account Transfers',
        rows: [],
        totals: {},
      }));
      component.run();
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('agrivio-ui-empty-state');
      expect(emptyState).toBeTruthy();
    });

    it('24. formats dates cleanly without raw ISO strings', () => {
      component.onReportChange('account-statement');
      component.setFilter('accountId', 'acc-1');
      mockReportsApi.getReport.mockReturnValue(of(mockAccountStatementDataset));
      component.run();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[data-testid="account-statement-table"]');
      expect(table?.textContent).toContain('24 Sep 2026');
      expect(table?.textContent).not.toContain('2026-09-24T10:30:00.000Z');
    });

    it('25. provides accessible semantic table headers with scope="col"', () => {
      component.onReportChange('account-transfers');
      mockReportsApi.getReport.mockReturnValue(of(mockTransfersDataset));
      component.run();
      fixture.detectChanges();

      const ths = fixture.nativeElement.querySelectorAll('[data-testid="account-transfers-table"] th');
      expect(ths.length).toBeGreaterThan(0);
      for (const th of Array.from(ths)) {
        expect((th as HTMLElement).getAttribute('scope')).toBe('col');
      }
    });

    it('26. switches reports via quick navigation tabs', () => {
      const tab = fixture.nativeElement.querySelector('[data-testid="tab-daily-cash-position"]');
      expect(tab).toBeTruthy();
      tab.click();
      fixture.detectChanges();

      expect(component.selectedKey()).toBe('daily-cash-position');
      expect(component.filters()['businessDate']).toBeTruthy();
    });
  });
});
