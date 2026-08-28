import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardPage } from './dashboard.page';
import { DashboardApi } from '../../data-access/dashboard.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { DashboardPayload } from '../../models/dashboard.models';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  let component: DashboardPage;
  let getDashboardMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    }) as unknown as CanvasRenderingContext2D;
  });

  const mockDashboardData: DashboardPayload = {
    businessDate: '2026-08-28',
    period: { fromDate: '2026-08-22', toDate: '2026-08-28' },
    entitlements: { reportsExportsAllowed: true },
    todaysSales: { amount: '150000.00', currency: 'PKR' },
    todaysPurchases: { amount: '80000.00', currency: 'PKR' },
    todaysExpenses: { amount: '12500.00', currency: 'PKR' },
    grossProfit: { amount: '450000.00', currency: 'PKR' },
    periodSales: { amount: '7865650.00', currency: 'PKR' },
    periodPurchases: { amount: '2206000.00', currency: 'PKR' },
    periodGrossProfit: { amount: '5534200.00', currency: 'PKR' },
    netSalesRevenue: { amount: '7865650.00', currency: 'PKR' },
    netCogs: { amount: '2331450.00', currency: 'PKR' },
    cashBalances: { amount: '234100.00', currency: 'PKR' },
    bankBalances: { amount: '2617500.00', currency: 'PKR' },
    jazzCashBalance: { amount: '123000.00', currency: 'PKR' },
    easypaisaBalance: { amount: '35000.00', currency: 'PKR' },
    customerReceivables: { amount: '2768650.00', currency: 'PKR' },
    supplierPayables: { amount: '2206000.00', currency: 'PKR' },
    stockValuation: { amount: '52028850.00', currency: 'PKR' },
    accountDistribution: [
      { key: 'cash', label: 'Cash', balance: { amount: '234100.00', currency: 'PKR' } },
      { key: 'bank', label: 'Bank', balance: { amount: '2617500.00', currency: 'PKR' } },
      { key: 'jazzcash', label: 'JazzCash', balance: { amount: '123000.00', currency: 'PKR' } },
      { key: 'easypaisa', label: 'Easypaisa', balance: { amount: '35000.00', currency: 'PKR' } },
    ],
    salesVsPurchases: [
      {
        date: '2026-08-22',
        sales: { amount: '1000000.00', currency: 'PKR' },
        purchases: { amount: '500000.00', currency: 'PKR' },
      },
      {
        date: '2026-08-28',
        sales: { amount: '1200000.00', currency: 'PKR' },
        purchases: { amount: '600000.00', currency: 'PKR' },
      },
    ],
    grossProfitTrend: [
      { date: '2026-08-22', grossProfit: { amount: '500000.00', currency: 'PKR' } },
      { date: '2026-08-28', grossProfit: { amount: '600000.00', currency: 'PKR' } },
    ],
    lowStockCount: 23,
    upcomingExpiryCount: 18,
    expiredStockCount: 5,
    deadStockSummary: {
      count: 14,
      inactivityDays: 90,
      items: [{ productId: 'p1', sellableQuantityBase: '10' }],
    },
    recentSales: [
      {
        id: 'sale-1',
        invoiceNumber: 'INV-000205',
        saleDate: '2026-08-28',
        saleTotal: { amount: '285600.00', currency: 'PKR' },
        customerId: 'c1',
        warehouseId: 'w1',
      },
    ],
    topSellingProducts: [
      {
        productId: 'prod-1',
        productName: 'Sona Urea 50kg',
        quantityBase: '120.000',
        revenue: { amount: '567250.00', currency: 'PKR' },
      },
    ],
  };

  async function createComponent(permissions: string[] = ['dashboard.view', 'sales.view', 'purchases.view', 'expenses.view', 'accounts.view', 'customers.view', 'suppliers.view', 'inventory.view', 'alerts.view', 'reports.view']) {
    getDashboardMock = vi.fn().mockReturnValue(of(mockDashboardData));

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => permissions.includes(perm),
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
          },
        },
        {
          provide: DashboardApi,
          useValue: {
            getDashboard: getDashboardMock,
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranchOptions: () =>
              of([{ id: 'b1', name: 'Main Branch', code: 'MAIN', status: 'active' }]),
            listWarehouseOptions: () =>
              of([{ id: 'w1', branchId: 'b1', name: 'Main Warehouse', code: 'MAIN-WH', status: 'active' }]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders Products-aligned header, eyebrow, and lede', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-head__eyebrow')?.textContent).toContain('Operations & Overview');
    expect(root.querySelector('.page-head__title')?.textContent).toContain('Dashboard');
    expect(root.querySelector('.page-head__lede')?.textContent).toContain('Operational overview for your organization.');
    expect(root.querySelector('[data-testid="dashboard-refresh-btn"]')).toBeTruthy();
  });

  it('renders filter bar with from/to date, branch, and warehouse inputs', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dashboard-from-date-input"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dashboard-to-date-input"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dashboard-branch-select"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dashboard-warehouse-select"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dashboard-apply-filters-btn"]')).toBeTruthy();
  });

  it('renders primary financial KPI cards with authoritative period and today values', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    const salesCard = root.querySelector('[data-testid="dash-card-sales"]');
    expect(salesCard).toBeTruthy();
    expect(salesCard?.textContent).toContain('7,865,650.00');
    expect(salesCard?.textContent).toContain('150,000.00');

    const purchasesCard = root.querySelector('[data-testid="dash-card-purchases"]');
    expect(purchasesCard?.textContent).toContain('2,206,000.00');
    expect(purchasesCard?.textContent).toContain('80,000.00');

    const expensesCard = root.querySelector('[data-testid="dash-card-expenses"]');
    expect(expensesCard?.textContent).toContain('Expenses (Today)');
    expect(expensesCard?.textContent).toContain('12,500.00');

    const gpCard = root.querySelector('[data-testid="dash-card-gross-profit"]');
    expect(gpCard?.textContent).toContain('5,534,200.00');

    const recCard = root.querySelector('[data-testid="dash-card-receivables"]');
    expect(recCard?.textContent).toContain('2,768,650.00');
  });

  it('renders secondary account KPI cards with current as-of balances', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dash-card-payables"]')?.textContent).toContain('2,206,000.00');
    expect(root.querySelector('[data-testid="dash-card-cash"]')?.textContent).toContain('234,100.00');
    expect(root.querySelector('[data-testid="dash-card-bank"]')?.textContent).toContain('2,617,500.00');
    expect(root.querySelector('[data-testid="dash-card-jazzcash"]')?.textContent).toContain('123,000.00');
    expect(root.querySelector('[data-testid="dash-card-easypaisa"]')?.textContent).toContain('35,000.00');
    expect(root.querySelector('[data-testid="dash-card-stock-val"]')?.textContent).toContain('52,028,850.00');
  });

  it('renders operational chart panels and distribution cards', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dash-panel-sales-purchases-trend"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-panel-gross-profit-trend"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-panel-top-products"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-panel-account-dist"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-panel-stock-expiry"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-expiry-upcoming-count"]')?.textContent?.trim()).toBe('18');
    expect(root.querySelector('[data-testid="dash-expiry-expired-count"]')?.textContent?.trim()).toBe('5');
  });

  it('renders inventory health operational cards with alert counts', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dash-low-stock"]')?.textContent?.trim()).toBe('23');
    expect(root.querySelector('[data-testid="dash-upcoming-expiry"]')?.textContent?.trim()).toBe('18');
    expect(root.querySelector('[data-testid="dash-expired-stock"]')?.textContent?.trim()).toBe('5');
    expect(root.querySelector('[data-testid="dash-dead-stock"]')?.textContent?.trim()).toBe('14');
  });

  it('renders dense recent sales table with invoice link, date, total, and status', async () => {
    await createComponent();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dash-panel-recent-sales"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-recent-sale-row"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="dash-recent-sale-link"]')?.textContent?.trim()).toBe('INV-000205');
    expect(root.textContent).toContain('285,600.00');
  });

  it('calls getDashboard with active filter parameters when filters are applied and refreshed', async () => {
    await createComponent();

    component.branchId.set('b1');
    component.warehouseId.set('w1');
    component.fromDate.set('2026-08-01');
    component.toDate.set('2026-08-28');

    component.reload();
    expect(getDashboardMock).toHaveBeenCalledWith({
      fromDate: '2026-08-01',
      toDate: '2026-08-28',
      branchId: 'b1',
      warehouseId: 'w1',
    });

    component.clearFilters();
    expect(component.branchId()).toBe('');
    expect(component.warehouseId()).toBe('');
  });

  it('renders permission alert when user lacks dashboard.view permission', async () => {
    await createComponent([]);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="dashboard-permission-alert"]')).toBeTruthy();
  });

  it('renders error alert when dashboard request fails without zeroing out values', async () => {
    getDashboardMock = vi.fn().mockReturnValue(
      throwError(() => new HttpErrorResponse({ error: { error: { message: 'Database query timeout' } }, status: 500 }))
    );

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
          },
        },
        {
          provide: DashboardApi,
          useValue: {
            getDashboard: getDashboardMock,
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Database query timeout');
    expect(root.querySelector('[data-testid="dash-todays-sales"]')).toBeFalsy();
  });
});
