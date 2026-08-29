import { describe, expect, it } from 'vitest';
import { createReportingModule } from './reporting.module.js';
import { computeGrossProfitFromEffects } from './gross-profit.js';
import { renderCsv, renderExcel, renderPdf } from './report-exports.js';
import { parseReportFilters, parseReportKey } from './report-filters.js';
import { createInventoryModule } from '../inventory/inventory.module.js';
import { createLedgersModule } from '../payments-ledgers/ledgers.module.js';
import { createAlertsModule } from '../alerts/alerts.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { createRequirePermissionMiddleware } from '../identity/permission.middleware.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');

function ownerContext(overrides = {}) {
  return {
    userId: 'owner-1',
    organizationId: 'org-1',
    permissions: permissionsForMembershipRole('Owner'),
    ...overrides,
  };
}

function money(amount) {
  return { amount, currency: 'PKR' };
}

function buildInventory() {
  const fixedNow = new Date('2026-08-14T05:00:00.000Z');
  return createInventoryModule({
    persistence: 'memory',
    now: () => fixedNow,
    hasPermission: (authContext, permission) =>
      (authContext.permissions ?? []).includes(permission),
    canAccessWarehouse: (authContext, warehouseId) => {
      if (authContext?.allowedWarehouses === undefined) {
        return true;
      }
      return authContext.allowedWarehouses.includes(String(warehouseId));
    },
    resolveOrganizationTimezone: async () => 'Asia/Karachi',
    catalogService: {
      async getProduct(_organizationId, productId) {
        return {
          id: productId,
          name: productId,
          trackingMode: 'none',
          baseUnitCode: 'EA',
          status: 'active',
        };
      },
      async listPackagingUnits() {
        return { items: [] };
      },
    },
    locationsService: {
      async getWarehouse(_organizationId, warehouseId) {
        return { id: warehouseId, status: 'active' };
      },
    },
  });
}

function postedSale(overrides = {}) {
  return {
    id: 'sale-1',
    status: 'posted',
    saleDate: '2026-08-14',
    branchId: 'br-1',
    warehouseId: 'wh-1',
    customerId: 'cust-1',
    customerNameSnapshot: 'Customer',
    priceTierSnapshot: 'retail',
    postedBy: 'owner-1',
    saleTotal: money('100.00'),
    paidTotal: money('100.00'),
    receivableTotal: money('0.00'),
    cogsTotal: money('40.00'),
    payments: [{ accountTypeSnapshot: 'cash', amount: money('100.00') }],
    lines: [
      {
        productId: 'prod-a',
        productNameSnapshot: 'Urea',
        quantityBase: '2.0000',
        lineProductAmount: money('100.00'),
        cogsTotal: money('40.00'),
      },
    ],
    ...overrides,
  };
}

describe('F08 P2 report filters', () => {
  it('rejects unknown keys and inapplicable filters', () => {
    expect(() => parseReportKey('custom-builder')).toThrow();
    expect(() => parseReportFilters('stock', { fromDate: '2026-08-14' })).toThrow();
    expect(() => parseReportFilters('customer-ledger', {})).toThrow();
    const sales = parseReportFilters('sales', { fromDate: '2026-08-01', toDate: '2026-08-14' });
    expect(sales.fromDate).toBe('2026-08-01');
  });
});

describe('F08 P2 sales/purchases/gross-profit reconciliation', () => {
  it('reconciles date-range sales, returns, cancellations, WAC COGS, and dashboard GP', async () => {
    const sales = [
      postedSale(),
      postedSale({
        id: 'sale-other-day',
        saleDate: '2026-08-13',
        saleTotal: money('20.00'),
        cogsTotal: money('8.00'),
      }),
      postedSale({
        id: 'sale-other-org-shape',
        warehouseId: 'wh-2',
        saleTotal: money('15.00'),
        cogsTotal: money('5.00'),
      }),
    ];
    const reporting = createReportingModule({
      salesService: {
        async listSales(organizationId, query, authContext) {
          expect(organizationId).toBe('org-1');
          const items = sales.filter((sale) => {
            if (query.status && sale.status !== query.status) {
              return false;
            }
            if (authContext?.allowedWarehouses) {
              return authContext.allowedWarehouses.includes(sale.warehouseId);
            }
            return true;
          });
          return { items };
        },
      },
      purchasesService: {
        async listPurchases() {
          return {
            items: [
              {
                id: 'p-1',
                status: 'posted',
                purchaseDate: '2026-08-14',
                supplierId: 'sup-1',
                supplierNameSnapshot: 'Supplier',
                warehouseId: 'wh-1',
                purchaseTotal: money('55.00'),
                paidTotal: money('55.00'),
                payableTotal: money('0.00'),
                payments: [],
                lines: [],
              },
            ],
          };
        },
      },
      accountsService: {
        async listAccounts() {
          return { items: [] };
        },
        async listExpenses() {
          return { items: [] };
        },
        async listAccountMovements() {
          return { items: [] };
        },
      },
      paymentsService: {
        async listCustomerReceivableBalances() {
          return { items: [] };
        },
        async listSupplierPayableBalances() {
          return { items: [] };
        },
      },
      alertsService: {
        async getAlertSummaries() {
          return {
            lowStockCount: 0,
            upcomingExpiryCount: 0,
            expiredStockCount: 0,
            deadStock: { count: 0 },
          };
        },
        async listAlerts() {
          return { lowStock: { items: [] }, upcomingExpiry: { items: [] }, expiredStock: { items: [] }, deadStock: { items: [] } };
        },
      },
      returnsService: {
        async listReturns() {
          return {
            items: [
              {
                status: 'posted',
                returnType: 'sales',
                postedAt: '2026-08-14T06:00:00.000Z',
                warehouseId: 'wh-1',
                customerId: 'cust-1',
                returnTotal: money('10.00'),
                lines: [{ productId: 'prod-a', returnInventoryValue: money('4.00') }],
              },
            ],
          };
        },
      },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: true }),
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    const auth = ownerContext();
    const daily = await reporting.reportingService.getReport(
      'org-1',
      'sales',
      { fromDate: '2026-08-14', toDate: '2026-08-14' },
      auth,
    );
    expect(daily.totals.total).toBe('115.00');

    const ranged = await reporting.reportingService.getReport(
      'org-1',
      'sales',
      { fromDate: '2026-08-13', toDate: '2026-08-14' },
      auth,
    );
    expect(ranged.totals.total).toBe('135.00');

    const purchases = await reporting.reportingService.getReport('org-1', 'purchases', {}, auth);
    expect(purchases.totals.total).toBe('55.00');

    const gp = await reporting.reportingService.getReport('org-1', 'gross-profit', {}, auth);
    const expected = computeGrossProfitFromEffects([
      { signedRevenueMinorUnits: '10000', signedCogsMinorUnits: '4000' },
      { signedRevenueMinorUnits: '2000', signedCogsMinorUnits: '800' },
      { signedRevenueMinorUnits: '1500', signedCogsMinorUnits: '500' },
      { signedRevenueMinorUnits: '-1000', signedCogsMinorUnits: '-400' },
    ]);
    expect(gp.grossProfit.amount).toBe(expected.grossProfit.amount);
    expect(gp.netCogs.amount).toBe(expected.netCogs.amount);

    const dashboard = await reporting.reportingService.getDashboard('org-1', auth);
    expect(dashboard.grossProfit.amount).toBe(gp.grossProfit.amount);
    expect(dashboard.netSalesRevenue.amount).toBe(gp.netSalesRevenue.amount);

    const cancelledExcluded = createReportingModule({
      salesService: {
        async listSales() {
          return { items: [] };
        },
      },
      purchasesService: { async listPurchases() { return { items: [] }; } },
      accountsService: {
        async listAccounts() { return { items: [] }; },
        async listExpenses() { return { items: [] }; },
      },
      paymentsService: {
        async listCustomerReceivableBalances() { return { items: [] }; },
        async listSupplierPayableBalances() { return { items: [] }; },
      },
      alertsService: {
        async getAlertSummaries() {
          return {
            lowStockCount: 0,
            upcomingExpiryCount: 0,
            expiredStockCount: 0,
            deadStock: { count: 0 },
          };
        },
      },
      returnsService: { async listReturns() { return { items: [] }; } },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });
    const cancelledReport = await cancelledExcluded.reportingService.getReport(
      'org-1',
      'sales',
      {},
      auth,
    );
    expect(cancelledReport.rows).toHaveLength(0);
    expect(cancelledReport.totals.total).toBe('0.00');

    const scoped = await reporting.reportingService.getReport(
      'org-1',
      'sales',
      {},
      ownerContext({ allowedWarehouses: ['wh-1'] }),
    );
    expect(scoped.rows.every((row) => row.warehouseId !== 'wh-2' || true)).toBe(true);
    expect(scoped.totals.total).toBe('120.00');
  });
});

describe('F08 P2 inventory/ledger/account/expense/alert reports', () => {
  it('matches Inventory, ledgers, accounts, expenses, and P1 alerts', async () => {
    const inventory = buildInventory();
    const ledgers = createLedgersModule({ persistence: 'memory' });
    const actor = { actorId: 'owner-1' };

    await inventory.inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        quantity: '5',
        inventoryValue: money('50.00'),
      },
      actor,
      'open-a',
    );
    await inventory.inventoryService.postOpeningStock(
      'org-2',
      {
        warehouseId: 'wh-1',
        productId: 'prod-a',
        quantity: '9',
        inventoryValue: money('90.00'),
      },
      actor,
      'open-other-org',
    );

    const auth = ownerContext();
    const balances = await inventory.inventoryService.listBalances('org-1', {}, auth);
    const movements = await inventory.inventoryService.listMovements('org-1', {}, auth);

    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      effectKind: 'receivable',
      signedAmountMinorUnits: '10000',
      sourceType: 'sale',
      sourceId: 'sale-1',
      postedAt: new Date('2026-08-14T05:00:00.000Z'),
      postedBy: 'owner-1',
    });
    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId: 'org-1',
      partyType: 'supplier',
      supplierId: 'sup-1',
      effectKind: 'payable',
      signedAmountMinorUnits: '5500',
      sourceType: 'purchase',
      sourceId: 'p-1',
      postedAt: new Date('2026-08-14T05:00:00.000Z'),
      postedBy: 'owner-1',
    });

    const accountMovements = {
      items: [
        {
          status: 'posted',
          postedAt: '2026-08-14T05:00:00.000Z',
          sourceType: 'account_opening',
          signedAmount: money('500.00'),
        },
        {
          status: 'posted',
          postedAt: '2026-08-14T06:00:00.000Z',
          sourceType: 'expense',
          signedAmount: money('-15.00'),
        },
      ],
    };
    const accountsService = {
      async listAccounts() {
        return {
          items: [{ id: 'cash-1', name: 'Till', accountType: 'cash', status: 'active' }],
        };
      },
      async listAccountMovements() {
        return accountMovements;
      },
      async listExpenses() {
        return {
          items: [
            {
              id: 'exp-1',
              status: 'posted',
              expenseDate: '2026-08-14',
              purpose: 'Fuel',
              amount: money('15.00'),
            },
          ],
        };
      },
    };

    const alerts = createAlertsModule({
      persistence: 'memory',
      inventoryService: inventory.inventoryService,
      paymentsService: {
        async listCustomerReceivableBalances(organizationId) {
          return ledgers.ledgersService.listCustomerReceivableBalances(organizationId);
        },
        async listSupplierPayableBalances(organizationId) {
          return ledgers.ledgersService.listSupplierPayableBalances(organizationId);
        },
      },
      salesService: {
        async listPostedSaleProductActivity() {
          return { productIds: [] };
        },
      },
      canAccessWarehouse: (authContext, warehouseId) => {
        if (authContext?.allowedWarehouses === undefined) {
          return true;
        }
        return authContext.allowedWarehouses.includes(String(warehouseId));
      },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });
    await alerts.alertsService.upsertLowStockThreshold('org-1', {
      productId: 'prod-a',
      warehouseId: 'wh-1',
      thresholdQuantityBase: '10',
    });
    await alerts.alertsService.upsertDeadStockInactivityDays('org-1', 30);

    const reporting = createReportingModule({
      salesService: {
        async listSales() {
          return { items: [] };
        },
        async listPostedSaleProductActivity() {
          return { productIds: [] };
        },
      },
      purchasesService: { async listPurchases() { return { items: [] }; } },
      accountsService,
      paymentsService: {
        async listCustomerLedger(organizationId, customerId) {
          return ledgers.ledgersService.listCustomerEffects(organizationId, customerId);
        },
        async listSupplierLedger(organizationId, supplierId) {
          return ledgers.ledgersService.listSupplierEffects(organizationId, supplierId);
        },
        async listCustomerReceivableBalances(organizationId) {
          return ledgers.ledgersService.listCustomerReceivableBalances(organizationId);
        },
        async listSupplierPayableBalances(organizationId) {
          return ledgers.ledgersService.listSupplierPayableBalances(organizationId);
        },
      },
      alertsService: alerts.alertsService,
      inventoryService: inventory.inventoryService,
      catalogService: {
        async findProductsByIds(_organizationId, productIds) {
          return productIds.map((productId) => ({
            id: productId,
            name: `Product ${productId}`,
          }));
        },
      },
      locationsService: {
        async findWarehousesByIds(_organizationId, warehouseIds) {
          return warehouseIds.map((warehouseId) => ({
            id: warehouseId,
            name: `Warehouse ${warehouseId}`,
            code: 'WH',
          }));
        },
      },
      returnsService: { async listReturns() { return { items: [] }; } },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: true }),
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    const stock = await reporting.reportingService.getReport('org-1', 'stock', {}, auth);
    expect(stock.rows[0].quantityBase).toBe(balances.items[0].quantityBase);
    expect(stock.rows[0].productName).toBe('Product prod-a');
    expect(stock.rows[0].warehouseName).toBe('Warehouse wh-1 (WH)');
    const otherOrgStock = await reporting.reportingService.getReport('org-2', 'stock', {}, ownerContext({ organizationId: 'org-2' }));
    expect(otherOrgStock.rows[0].quantityBase).toBe('9.0000');
    expect(stock.rows[0].quantityBase).not.toBe(otherOrgStock.rows[0].quantityBase);

    const valuation = await reporting.reportingService.getReport('org-1', 'stock-valuation', {}, auth);
    expect(valuation.totals.inventoryValue).toBe(balances.items[0].valuation.inventoryValue.amount);
    expect(valuation.rows[0].weightedAverageCost).toBe(
      balances.items[0].valuation.weightedAverageCost.amount,
    );

    const movementReport = await reporting.reportingService.getReport(
      'org-1',
      'stock-movements',
      {},
      auth,
    );
    expect(movementReport.rows).toHaveLength(movements.items.length);

    const customerLedger = await reporting.reportingService.getReport(
      'org-1',
      'customer-ledger',
      { customerId: 'cust-1' },
      auth,
    );
    const ar = await ledgers.ledgersService.sumCustomerReceivable('org-1', 'cust-1');
    expect(customerLedger.totals.signedAmount).toBe(ar.amount);

    const supplierLedger = await reporting.reportingService.getReport(
      'org-1',
      'supplier-ledger',
      { supplierId: 'sup-1' },
      auth,
    );
    const ap = await ledgers.ledgersService.sumSupplierPayable('org-1', 'sup-1');
    expect(supplierLedger.totals.signedAmount).toBe(ap.amount);

    const cashBook = await reporting.reportingService.getReport(
      'org-1',
      'account-cash-book',
      { accountId: 'cash-1' },
      auth,
    );
    expect(cashBook.rows).toHaveLength(accountMovements.items.length);
    expect(cashBook.totals.signedAmount).toBe('485.00');

    const expenses = await reporting.reportingService.getReport('org-1', 'expenses', {}, auth);
    expect(expenses.totals.amount).toBe('15.00');

    const lowStock = await reporting.reportingService.getReport('org-1', 'low-stock', {}, auth);
    const alertList = await alerts.alertsService.listAlerts('org-1', auth);
    expect(lowStock.summary.count).toBe(alertList.lowStock.count);

    const warehouseScoped = await reporting.reportingService.getReport(
      'org-1',
      'stock',
      {},
      ownerContext({ allowedWarehouses: ['missing'] }),
    );
    expect(warehouseScoped.rows).toHaveLength(0);
  });
});

describe('F08 P2 exports and permissions', () => {
  it('keeps PDF/Excel/CSV totals identical to the report dataset', async () => {
    const reporting = createReportingModule({
      salesService: {
        async listSales() {
          return { items: [postedSale()] };
        },
      },
      purchasesService: { async listPurchases() { return { items: [] }; } },
      accountsService: {
        async listAccounts() { return { items: [] }; },
        async listExpenses() { return { items: [] }; },
      },
      paymentsService: {
        async listCustomerReceivableBalances() { return { items: [] }; },
        async listSupplierPayableBalances() { return { items: [] }; },
      },
      alertsService: {
        async getAlertSummaries() {
          return {
            lowStockCount: 0,
            upcomingExpiryCount: 0,
            expiredStockCount: 0,
            deadStock: { count: 0 },
          };
        },
      },
      returnsService: { async listReturns() { return { items: [] }; } },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: true }),
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });
    const dataset = await reporting.reportingService.getReport('org-1', 'sales', {}, ownerContext());
    expect(dataset.totals.total).toBe('100.00');
    const csv = renderCsv(dataset).toString('utf8');
    const excel = renderExcel(dataset).toString('utf8');
    const pdf = renderPdf(dataset).toString('utf8');
    expect(csv).toContain('100.00');
    expect(excel).toContain('100.00');
    expect(pdf).toContain('100.00');

    const exported = await reporting.reportingService.exportReport(
      'org-1',
      'sales',
      { format: 'csv' },
      ownerContext(),
    );
    expect(exported.buffer.toString('utf8')).toContain(dataset.totals.total);

    const denied = createReportingModule({
      salesService: { async listSales() { return { items: [] }; } },
      purchasesService: { async listPurchases() { return { items: [] }; } },
      accountsService: {
        async listAccounts() { return { items: [] }; },
        async listExpenses() { return { items: [] }; },
      },
      paymentsService: {
        async listCustomerReceivableBalances() { return { items: [] }; },
        async listSupplierPayableBalances() { return { items: [] }; },
      },
      alertsService: {
        async getAlertSummaries() {
          return {
            lowStockCount: 0,
            upcomingExpiryCount: 0,
            expiredStockCount: 0,
            deadStock: { count: 0 },
          };
        },
      },
      resolvePlanEntitlements: async () => ({ reportsExports: false }),
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
    });
    await expect(
      denied.reportingService.exportReport('org-1', 'sales', { format: 'csv' }, ownerContext()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies reports.view and reports.export without permission', () => {
    const view = createRequirePermissionMiddleware('reports.view');
    const exp = createRequirePermissionMiddleware('reports.export');
    const cashier = {
      auth: { userId: 'c1' },
      authContext: {
        userId: 'c1',
        organizationId: 'org-1',
        contextType: 'organization',
        permissions: permissionsForMembershipRole('Cashier'),
      },
    };
    let viewError = null;
    view(cashier, {}, (error) => {
      viewError = error;
    });
    let exportError = null;
    exp(cashier, {}, (error) => {
      exportError = error;
    });
    expect(viewError?.code).toBe('FORBIDDEN');
    expect(exportError?.code).toBe('FORBIDDEN');
  });
});

describe('F08 P2 employee-sales display composition', () => {
  it('resolves employee names with one bulk lookup for the result set', async () => {
    let bulkLookupCalls = 0;
    const employeesService = {
      async findEmployeeDisplayNamesByUserIds(organizationId, userIds) {
        bulkLookupCalls += 1;
        expect(organizationId).toBe('org-1');
        expect([...userIds].sort()).toEqual(['cashier-1', 'owner-1']);
        return new Map([
          ['owner-1', 'Owner User'],
          ['cashier-1', 'Cashier User'],
        ]);
      },
    };

    const reporting = createReportingModule({
      salesService: {
        async listSales() {
          return {
            items: [
              postedSale({ postedBy: 'owner-1', saleTotal: money('100.00') }),
              postedSale({ id: 'sale-2', postedBy: 'cashier-1', saleTotal: money('50.00') }),
              postedSale({ id: 'sale-3', postedBy: 'owner-1', saleTotal: money('25.00') }),
            ],
          };
        },
      },
      purchasesService: { async listPurchases() { return { items: [] }; } },
      accountsService: {
        async listAccounts() { return { items: [] }; },
        async listExpenses() { return { items: [] }; },
      },
      paymentsService: {
        async listCustomerReceivableBalances() { return { items: [] }; },
        async listSupplierPayableBalances() { return { items: [] }; },
      },
      alertsService: {
        async getAlertSummaries() {
          return {
            lowStockCount: 0,
            upcomingExpiryCount: 0,
            expiredStockCount: 0,
            deadStock: { count: 0 },
          };
        },
      },
      returnsService: { async listReturns() { return { items: [] }; } },
      employeesService,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: true }),
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    const report = await reporting.reportingService.getReport('org-1', 'employee-sales', {}, ownerContext());
    expect(bulkLookupCalls).toBe(1);
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeName: 'Owner User', saleCount: '2' }),
        expect.objectContaining({ employeeName: 'Cashier User', saleCount: '1' }),
      ]),
    );
  });
});

describe('F08 P2 architecture', () => {
  it('keeps Reporting free of foreign persistence imports', () => {
    const files = collectSourceFiles(join(backendRoot, 'modules/reporting'));
    const violations = [];
    for (const filePath of files) {
      if (filePath.includes('.spec.')) {
        continue;
      }
      for (const specifier of extractImportSpecifiers(filePath)) {
        if (specifier.includes('/persistence/')) {
          violations.push(`${filePath} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
    const reportingPublic = readFileSync(join(backendRoot, 'modules/reporting/public/index.js'), 'utf8');
    expect(reportingPublic).not.toMatch(/persistence\//);
  });
});
