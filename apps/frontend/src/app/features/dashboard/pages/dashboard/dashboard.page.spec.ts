import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DashboardPage } from './dashboard.page';
import { DashboardApi } from '../../data-access/dashboard.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { formatPkrAmount } from '../../../../shared/chart/chart-format.util';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => perm === 'dashboard.view',
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
          },
        },
        {
          provide: DashboardApi,
          useValue: {
            getDashboard: () =>
              of({
                businessDate: '2026-08-17',
                period: { fromDate: '2026-08-11', toDate: '2026-08-17' },
                entitlements: { reportsExportsAllowed: true },
                todaysSales: { amount: '0.00', currency: 'PKR' },
                todaysPurchases: { amount: '0.00', currency: 'PKR' },
                todaysExpenses: { amount: '0.00', currency: 'PKR' },
                grossProfit: { amount: '0.00', currency: 'PKR' },
                netSalesRevenue: { amount: '0.00', currency: 'PKR' },
                netCogs: { amount: '0.00', currency: 'PKR' },
                cashBalances: { amount: '0.00', currency: 'PKR' },
                bankBalances: { amount: '0.00', currency: 'PKR' },
                jazzCashBalance: { amount: '0.00', currency: 'PKR' },
                easypaisaBalance: { amount: '0.00', currency: 'PKR' },
                customerReceivables: { amount: '0.00', currency: 'PKR' },
                supplierPayables: { amount: '0.00', currency: 'PKR' },
                stockValuation: { amount: '0.00', currency: 'PKR' },
                accountDistribution: [],
                salesVsPurchases: [],
                grossProfitTrend: [],
                lowStockCount: 0,
                upcomingExpiryCount: 0,
                expiredStockCount: 0,
                deadStockSummary: { count: 0, inactivityDays: null, items: [] },
                recentSales: [],
                topSellingProducts: [],
              }),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of([{ id: 'b1', name: 'Main', code: 'MAIN', status: 'active' }]),
            listWarehouses: () => of([{ id: 'w1', name: 'Central', code: 'CEN', status: 'active' }]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  it('renders dashboard KPIs and zero values as PKR 0.00', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Dashboard');
    expect(fixture.nativeElement.textContent).toContain(formatPkrAmount('0.00'));
    expect(fixture.nativeElement.querySelector('[data-testid="dash-todays-sales"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('agrivio-ui-line-chart')).toBeTruthy();
  });
});
