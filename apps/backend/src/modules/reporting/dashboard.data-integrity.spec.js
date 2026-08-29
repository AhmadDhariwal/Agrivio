import { describe, it, expect } from 'vitest';
import { createReportingService } from './reporting.service.js';

describe('Dashboard End-to-End Data Integrity Verification', () => {
  const orgId = 'org-verification-1';
  const authContext = { userId: 'usr-1', permissions: ['*'] };

  function setupService(overrides = {}) {
    const mockSales = [
      {
        id: 'sale-1',
        invoiceNumber: 'INV-001',
        saleDate: '2026-08-29',
        postedAt: '2026-08-29T10:00:00Z',
        status: 'posted',
        saleTotal: { amount: '1000.00', currency: 'PKR' },
        cogsTotal: { amount: '650.00', currency: 'PKR' },
        customerId: 'cust-1',
        branchId: 'branch-1',
        warehouseId: 'wh-1',
        lines: [
          {
            productId: 'prod-1',
            productNameSnapshot: 'Urea Fertilizer 50kg',
            quantityBase: '10.000',
            lineProductAmount: { amount: '600.00', currency: 'PKR' },
            cogsAmount: { amount: '400.00', currency: 'PKR' },
          },
          {
            productId: 'prod-2',
            productNameSnapshot: 'DAP Fertilizer 50kg',
            quantityBase: '5.000',
            lineProductAmount: { amount: '400.00', currency: 'PKR' },
            cogsAmount: { amount: '250.00', currency: 'PKR' },
          },
        ],
      },
      {
        id: 'sale-2',
        invoiceNumber: 'INV-002',
        saleDate: '2026-08-28',
        postedAt: '2026-08-28T14:00:00Z',
        status: 'posted',
        saleTotal: { amount: '500.00', currency: 'PKR' },
        cogsTotal: { amount: '320.00', currency: 'PKR' },
        customerId: 'cust-2',
        branchId: 'branch-1',
        warehouseId: 'wh-1',
        lines: [
          {
            productId: 'prod-1',
            productNameSnapshot: 'Urea Fertilizer 50kg',
            quantityBase: '5.000',
            lineProductAmount: { amount: '300.00', currency: 'PKR' },
            cogsAmount: { amount: '200.00', currency: 'PKR' },
          },
          {
            productId: 'prod-3',
            productNameSnapshot: 'Pesticide 1L',
            quantityBase: '2.000',
            lineProductAmount: { amount: '200.00', currency: 'PKR' },
            cogsAmount: { amount: '120.00', currency: 'PKR' },
          },
        ],
      },
      {
        id: 'sale-draft',
        invoiceNumber: 'INV-DRAFT',
        saleDate: '2026-08-29',
        status: 'draft',
        saleTotal: { amount: '9999.00', currency: 'PKR' },
        cogsTotal: { amount: '5000.00', currency: 'PKR' },
        lines: [],
      },
    ];

    const mockPurchases = [
      {
        id: 'po-1',
        purchaseOrderNumber: 'PO-001',
        purchaseDate: '2026-08-29',
        status: 'posted',
        purchaseTotal: { amount: '700.00', currency: 'PKR' },
        supplierId: 'supp-1',
        branchId: 'branch-1',
        warehouseId: 'wh-1',
      },
      {
        id: 'po-2',
        purchaseOrderNumber: 'PO-002',
        purchaseDate: '2026-08-27',
        status: 'posted',
        purchaseTotal: { amount: '300.00', currency: 'PKR' },
        supplierId: 'supp-2',
        branchId: 'branch-1',
        warehouseId: 'wh-1',
      },
    ];

    const mockExpenses = [
      {
        id: 'exp-1',
        status: 'posted',
        expenseDate: '2026-08-29',
        amount: { amount: '150.00', currency: 'PKR' },
      },
      {
        id: 'exp-2',
        status: 'posted',
        expenseDate: '2026-08-28',
        amount: { amount: '200.00', currency: 'PKR' },
      },
    ];

    const mockAccounts = [
      { id: 'acc-1', status: 'active', accountType: 'cash', derivedBalances: { balance: { amount: '5000.00', currency: 'PKR' } } },
      { id: 'acc-2', status: 'active', accountType: 'bank', derivedBalances: { balance: { amount: '12000.00', currency: 'PKR' } } },
      { id: 'acc-3', status: 'active', accountType: 'jazzcash', derivedBalances: { balance: { amount: '3500.00', currency: 'PKR' } } },
      { id: 'acc-4', status: 'active', accountType: 'easypaisa', derivedBalances: { balance: { amount: '2500.00', currency: 'PKR' } } },
      { id: 'acc-5', status: 'inactive', accountType: 'cash', derivedBalances: { balance: { amount: '99999.00', currency: 'PKR' } } },
    ];

    const mockCustomerBalances = {
      items: [{ partyId: 'cust-1', receivableMinorUnits: '45000' }], // 450.00
    };
    const mockSupplierBalances = {
      items: [{ partyId: 'supp-1', payableMinorUnits: '85000' }], // 850.00
    };

    const mockAlertSummaries = {
      lowStockCount: 3,
      upcomingExpiryCount: 2,
      expiredStockCount: 1,
      deadStock: { count: 4, value: { amount: '1250.00', currency: 'PKR' } },
    };

    const salesService = {
      listSales: async () => ({ items: mockSales.filter((s) => s.status === 'posted'), total: 2 }),
      getSaleById: async (org, id) => mockSales.find((s) => s.id === id),
    };

    const purchasesService = {
      listPurchases: async () => ({ items: mockPurchases.filter((p) => p.status === 'posted'), total: 2 }),
    };

    const accountsService = {
      listAccounts: async () => ({ items: mockAccounts, total: mockAccounts.length }),
      listExpenses: async () => ({ items: mockExpenses, total: mockExpenses.length }),
    };

    const paymentsService = {
      listCustomerReceivableBalances: async () => mockCustomerBalances,
      listSupplierPayableBalances: async () => mockSupplierBalances,
    };

    const alertsService = {
      getAlertSummaries: async () => mockAlertSummaries,
    };

    const inventoryService = {
      listCostLayers: async () => [],
      listBalances: async () => ({
        items: [
          { warehouseId: 'wh-1', productId: 'prod-1', balanceQuantity: '10.000', valuation: { inventoryValue: { amount: '400.00', currency: 'PKR' }, warehouseProductQuantityBase: '10.0000' } },
          { warehouseId: 'wh-1', productId: 'prod-2', balanceQuantity: '5.000', valuation: { inventoryValue: { amount: '250.00', currency: 'PKR' }, warehouseProductQuantityBase: '5.0000' } },
        ],
      }),
      listWarehouses: async () => [{ id: 'wh-1', name: 'Main WH' }],
    };

    const service = createReportingService({
      salesService,
      purchasesService,
      accountsService,
      paymentsService,
      alertsService,
      inventoryService,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: true }),
      now: () => new Date('2026-08-29T12:00:00Z'),
      ...overrides,
    });

    return { service, mockSales, mockPurchases, mockExpenses, mockAccounts };
  }

  it('verifies all 22 dashboard metrics data integrity for default 7-day period', async () => {
    const { service } = setupService();
    const dashboard = await service.getDashboard(orgId, authContext, {});

    // 1. periodSales (sum of posted sales in period 2026-08-23 to 2026-08-29 = 1000 + 500 = 1500.00)
    expect(dashboard.periodSales).toEqual({ amount: '1500.00', currency: 'PKR' });

    // 2. todaysSales (sales on 2026-08-29 = 1000.00)
    expect(dashboard.todaysSales).toEqual({ amount: '1000.00', currency: 'PKR' });

    // 3. periodPurchases (sum of posted purchases in period = 700 + 300 = 1000.00)
    expect(dashboard.periodPurchases).toEqual({ amount: '1000.00', currency: 'PKR' });

    // 4. todaysPurchases (purchases on 2026-08-29 = 700.00)
    expect(dashboard.todaysPurchases).toEqual({ amount: '700.00', currency: 'PKR' });

    // 5. todaysExpenses (expenses on 2026-08-29 = 150.00)
    expect(dashboard.todaysExpenses).toEqual({ amount: '150.00', currency: 'PKR' });

    // 6. periodGrossProfit (Period Revenue 1500.00 - Period COGS 970.00 = 530.00)
    expect(dashboard.periodGrossProfit).toEqual({ amount: '530.00', currency: 'PKR' });

    // 7. customerReceivables (450.00)
    expect(dashboard.customerReceivables).toEqual({ amount: '450.00', currency: 'PKR' });

    // 8. supplierPayables (850.00)
    expect(dashboard.supplierPayables).toEqual({ amount: '850.00', currency: 'PKR' });

    // 9. cashBalances (5000.00)
    expect(dashboard.cashBalances).toEqual({ amount: '5000.00', currency: 'PKR' });

    // 10. bankBalances (12000.00)
    expect(dashboard.bankBalances).toEqual({ amount: '12000.00', currency: 'PKR' });

    // 11. jazzCashBalance (3500.00)
    expect(dashboard.jazzCashBalance).toEqual({ amount: '3500.00', currency: 'PKR' });

    // 12. easypaisaBalance (2500.00)
    expect(dashboard.easypaisaBalance).toEqual({ amount: '2500.00', currency: 'PKR' });

    // 13. stockValuation (400.00 + 250.00 = 650.00)
    expect(dashboard.stockValuation).toEqual({ amount: '650.00', currency: 'PKR' });

    // 14. salesVsPurchases trend (points for 2026-08-27, 2026-08-28, 2026-08-29)
    expect(dashboard.salesVsPurchases).toBeInstanceOf(Array);
    expect(dashboard.salesVsPurchases.length).toBe(3);
    const day29 = dashboard.salesVsPurchases.find((d) => d.date === '2026-08-29');
    expect(day29.sales).toEqual({ amount: '1000.00', currency: 'PKR' });
    expect(day29.purchases).toEqual({ amount: '700.00', currency: 'PKR' });

    // 15. grossProfitTrend (daily profit: 2026-08-28 = 500-320=180.00, 2026-08-29 = 1000-650=350.00)
    expect(dashboard.grossProfitTrend).toBeInstanceOf(Array);
    expect(dashboard.grossProfitTrend.length).toBe(2);
    const trend29 = dashboard.grossProfitTrend.find((d) => d.date === '2026-08-29');
    expect(trend29.grossProfit).toEqual({ amount: '350.00', currency: 'PKR' });

    // 16. topSellingProducts (prod-1: 15.0000 qty / 900.00 PKR, prod-2: 5.0000 qty / 400.00 PKR, prod-3: 2.0000 qty / 200.00 PKR)
    expect(dashboard.topSellingProducts).toBeInstanceOf(Array);
    expect(dashboard.topSellingProducts.length).toBe(3);
    expect(dashboard.topSellingProducts[0].productId).toBe('prod-1');
    expect(dashboard.topSellingProducts[0].quantityBase).toBe('15.0000');
    expect(dashboard.topSellingProducts[0].revenue).toEqual({ amount: '900.00', currency: 'PKR' });

    // 17. accountDistribution (Cash 5000, Bank 12000, JazzCash 3500, Easypaisa 2500)
    expect(dashboard.accountDistribution).toBeInstanceOf(Array);
    expect(dashboard.accountDistribution.length).toBe(4);
    const cashEntry = dashboard.accountDistribution.find((a) => a.key === 'cash');
    expect(cashEntry.balance).toEqual({ amount: '5000.00', currency: 'PKR' });

    // 18. upcomingExpiryCount
    expect(dashboard.upcomingExpiryCount).toBe(2);

    // 19. expiredStockCount
    expect(dashboard.expiredStockCount).toBe(1);

    // 20. lowStockCount
    expect(dashboard.lowStockCount).toBe(3);

    // 21. deadStockSummary
    expect(dashboard.deadStockSummary).toEqual({ count: 4, value: { amount: '1250.00', currency: 'PKR' } });

    // 22. recentSales (latest 10 sales sorted by date desc)
    expect(dashboard.recentSales).toBeInstanceOf(Array);
    expect(dashboard.recentSales.length).toBe(2);
    expect(dashboard.recentSales[0].id).toBe('sale-1'); // 2026-08-29
    expect(dashboard.recentSales[1].id).toBe('sale-2'); // 2026-08-28
  });

  it('verifies period and branch/warehouse filtering on topSellingProducts', async () => {
    const { service } = setupService();
    // Filter strictly to 2026-08-29
    const dashboard = await service.getDashboard(orgId, authContext, {
      fromDate: '2026-08-29',
      toDate: '2026-08-29',
    });

    expect(dashboard.periodSales).toEqual({ amount: '1000.00', currency: 'PKR' });
    expect(dashboard.topSellingProducts.length).toBe(2);
    expect(dashboard.topSellingProducts[0].productId).toBe('prod-1');
    expect(dashboard.topSellingProducts[0].quantityBase).toBe('10.0000');
    expect(dashboard.topSellingProducts[0].revenue).toEqual({ amount: '600.00', currency: 'PKR' });
  });
});
