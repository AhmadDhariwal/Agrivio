import { describe, expect, it } from 'vitest';
import {
  inactivityWindowStart,
  isDeadStock,
  isLowStock,
} from './alert-calculations.js';
import { createAlertsModule } from './alerts.module.js';
import { createInventoryModule } from '../inventory/inventory.module.js';
import { createLedgersModule } from '../payments-ledgers/ledgers.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { computeGrossProfitFromEffects } from '../reporting/gross-profit.js';
import { createReportingModule } from '../reporting/reporting.module.js';
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
          trackingMode: productId.includes('expiry') ? 'batch_expiry' : 'none',
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

describe('F08 P1 alert calculations (unit)', () => {
  it('evaluates low-stock, expiry window, expired, and dead-stock Frozen rules', () => {
    expect(
      isLowStock({
        sellableQuantityBaseMinorUnits: '10000',
        thresholdQuantityBaseMinorUnits: '10000',
      }),
    ).toBe(true);
    expect(
      isLowStock({
        sellableQuantityBaseMinorUnits: '10001',
        thresholdQuantityBaseMinorUnits: '10000',
      }),
    ).toBe(false);

    expect(inactivityWindowStart('2026-08-14', 30)).toBe('2026-07-16');
    expect(
      isDeadStock({
        sellableQuantityBaseMinorUnits: '1',
        hadSaleInInactivityPeriod: false,
      }),
    ).toBe(true);
    expect(
      isDeadStock({
        sellableQuantityBaseMinorUnits: '1',
        hadSaleInInactivityPeriod: true,
      }),
    ).toBe(false);
    expect(
      isDeadStock({
        sellableQuantityBaseMinorUnits: '0',
        hadSaleInInactivityPeriod: false,
      }),
    ).toBe(false);
  });

  it('computes gross profit as net sales revenue minus net COGS', () => {
    const result = computeGrossProfitFromEffects([
      { signedRevenueMinorUnits: '10000', signedCogsMinorUnits: '4000' },
      { signedRevenueMinorUnits: '-2000', signedCogsMinorUnits: '-800' },
    ]);
    expect(result.netSalesRevenue.amount).toBe('80.00');
    expect(result.netCogs.amount).toBe('32.00');
    expect(result.grossProfit.amount).toBe('48.00');
  });
});

describe('F08 P1 inventory alerts over Inventory read contracts', () => {
  it('matches low-stock and expiry/expired alerts to authoritative Inventory quantities', async () => {
    const inventory = buildInventory();
    const ledgers = createLedgersModule({ persistence: 'memory' });
    const salesService = {
      async listPostedSaleProductActivity() {
        return { productIds: [] };
      },
    };
    const alerts = createAlertsModule({
      persistence: 'memory',
      inventoryService: inventory.inventoryService,
      paymentsService: {
        async listCustomerReceivableBalances() {
          return { items: [] };
        },
        async listSupplierPayableBalances() {
          return { items: [] };
        },
        async sumCustomerReceivable(organizationId, customerId) {
          return ledgers.ledgersService.sumCustomerReceivable(organizationId, customerId);
        },
        async sumSupplierPayable(organizationId, supplierId) {
          return ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId);
        },
      },
      salesService,
      canAccessWarehouse: (authContext, warehouseId) => {
        if (authContext?.allowedWarehouses === undefined) {
          return true;
        }
        return authContext.allowedWarehouses.includes(String(warehouseId));
      },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    const actor = { actorId: 'owner-1' };
    await inventory.inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-low',
        quantity: '5',
        inventoryValue: { amount: '50.00', currency: 'PKR' },
      },
      actor,
      'open-low',
    );
    await inventory.inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-expiry',
        quantity: '2',
        batchNumber: 'LOT-SOON',
        expiryDate: '2026-08-20',
        inventoryValue: { amount: '20.00', currency: 'PKR' },
      },
      actor,
      'open-soon',
    );
    await inventory.inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-1',
        productId: 'prod-expiry',
        quantity: '1',
        batchNumber: 'LOT-OLD',
        expiryDate: '2026-08-01',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      },
      actor,
      'open-old',
    );
    await inventory.inventoryService.postOpeningStock(
      'org-1',
      {
        warehouseId: 'wh-2',
        productId: 'prod-low',
        quantity: '1',
        inventoryValue: { amount: '10.00', currency: 'PKR' },
      },
      actor,
      'open-wh2',
    );

    await alerts.alertsService.upsertLowStockThreshold('org-1', {
      productId: 'prod-low',
      warehouseId: 'wh-1',
      thresholdQuantityBase: '5',
    });
    await alerts.alertsService.upsertDeadStockInactivityDays('org-1', 30);

    const balances = await inventory.inventoryService.listBalances(
      'org-1',
      { productId: 'prod-low', warehouseId: 'wh-1' },
      ownerContext(),
    );
    expect(balances.items[0].quantityBase).toBe('5.0000');

    const expiry = await inventory.inventoryService.queryExpiry('org-1', {}, ownerContext());
    expect(expiry.thresholdDays).toBe(30);
    expect(expiry.items.some((item) => item.classification === 'upcoming')).toBe(true);
    expect(expiry.items.some((item) => item.classification === 'expired')).toBe(true);

    const result = await alerts.alertsService.listAlerts('org-1', ownerContext());
    expect(result.summaries.lowStockCount).toBe(1);
    expect(result.lowStock.items[0].sellableQuantityBase).toBe('5.0000');
    expect(result.summaries.upcomingExpiryCount).toBeGreaterThanOrEqual(1);
    expect(result.summaries.expiredStockCount).toBeGreaterThanOrEqual(1);
    expect(result.expiryThresholdDays).toBe(expiry.thresholdDays);
    expect(result.deadStock.configured).toBe(true);
    expect(result.deadStock.deadStockInactivityDays).toBe(30);
    expect(result.summaries.deadStockCount).toBeGreaterThanOrEqual(1);

    const scoped = await alerts.alertsService.listAlerts(
      'org-1',
      ownerContext({ allowedWarehouses: ['wh-2'] }),
    );
    expect(scoped.summaries.lowStockCount).toBe(0);
    expect(scoped.lowStock.items.every((item) => item.warehouseId === 'wh-2')).toBe(true);

    expect(() => alerts.alertsService.mutateInventory()).toThrow(/cannot mutate inventory/i);
    expect(() => alerts.alertsService.mutateLedgers()).toThrow(/cannot mutate ledgers/i);
  });

  it('reconciles customer/supplier dues alerts to Payments ledger sums and isolates tenants', async () => {
    const inventory = buildInventory();
    const ledgers = createLedgersModule({ persistence: 'memory' });
    const paymentsService = {
      async listCustomerReceivableBalances(organizationId) {
        return ledgers.ledgersService.listCustomerReceivableBalances(organizationId);
      },
      async listSupplierPayableBalances(organizationId) {
        return ledgers.ledgersService.listSupplierPayableBalances(organizationId);
      },
      async sumCustomerReceivable(organizationId, customerId) {
        return ledgers.ledgersService.sumCustomerReceivable(organizationId, customerId);
      },
      async sumSupplierPayable(organizationId, supplierId) {
        return ledgers.ledgersService.sumSupplierPayable(organizationId, supplierId);
      },
    };
    const alerts = createAlertsModule({
      persistence: 'memory',
      inventoryService: inventory.inventoryService,
      paymentsService,
      salesService: {
        async listPostedSaleProductActivity() {
          return { productIds: [] };
        },
      },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      effectKind: 'receivable',
      signedAmountMinorUnits: '25000',
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
      signedAmountMinorUnits: '18000',
      sourceType: 'purchase',
      sourceId: 'pur-1',
      postedAt: new Date('2026-08-14T05:00:00.000Z'),
      postedBy: 'owner-1',
    });
    await ledgers.ledgersService.postLedgerEffect(null, {
      organizationId: 'org-2',
      partyType: 'customer',
      customerId: 'cust-foreign',
      effectKind: 'receivable',
      signedAmountMinorUnits: '99900',
      sourceType: 'sale',
      sourceId: 'sale-x',
      postedAt: new Date('2026-08-14T05:00:00.000Z'),
      postedBy: 'owner-2',
    });

    const authoritativeReceivable = await paymentsService.sumCustomerReceivable('org-1', 'cust-1');
    const authoritativePayable = await paymentsService.sumSupplierPayable('org-1', 'sup-1');
    const alertsResult = await alerts.alertsService.listAlerts('org-1', ownerContext());

    expect(alertsResult.customerDues.items).toHaveLength(1);
    expect(alertsResult.customerDues.items[0].receivable.amount).toBe(
      authoritativeReceivable.amount,
    );
    expect(alertsResult.supplierDues.items).toHaveLength(1);
    expect(alertsResult.supplierDues.items[0].payable.amount).toBe(authoritativePayable.amount);
    expect(alertsResult.customerDues.items.some((item) => item.customerId === 'cust-foreign')).toBe(
      false,
    );

    const foreign = await alerts.alertsService.listAlerts('org-2', ownerContext({ organizationId: 'org-2' }));
    expect(foreign.customerDues.items).toHaveLength(1);
    expect(foreign.customerDues.items[0].customerId).toBe('cust-foreign');
    expect(foreign.customerDues.items[0].receivable.amount).toBe('999.00');
  });
});

describe('F08 P1 dashboard composition', () => {
  it('reconciles dashboard widgets to authoritative source calculations without duplicate balances', async () => {
    const inventory = buildInventory();
    const ledgers = createLedgersModule({ persistence: 'memory' });
    const paymentsService = {
      async listCustomerReceivableBalances(organizationId) {
        return ledgers.ledgersService.listCustomerReceivableBalances(organizationId);
      },
      async listSupplierPayableBalances(organizationId) {
        return ledgers.ledgersService.listSupplierPayableBalances(organizationId);
      },
    };
    const sales = [
      {
        id: 'sale-1',
        status: 'posted',
        saleDate: '2026-08-14',
        postedAt: '2026-08-14T05:00:00.000Z',
        saleTotal: { amount: '100.00', currency: 'PKR' },
        cogsTotal: { amount: '40.00', currency: 'PKR' },
        invoiceNumber: 'INV-1',
        customerId: 'cust-1',
        warehouseId: 'wh-1',
        lines: [
          {
            productId: 'prod-a',
            productNameSnapshot: 'Product A',
            quantityBase: '2.0000',
            lineProductAmount: { amount: '100.00', currency: 'PKR' },
          },
        ],
      },
    ];
    const salesService = {
      async listSales() {
        return { items: sales };
      },
      async listPostedSaleProductActivity() {
        return { productIds: ['prod-a'] };
      },
    };
    const purchasesService = {
      async listPurchases() {
        return {
          items: [
            {
              status: 'posted',
              purchaseDate: '2026-08-14',
              purchaseTotal: { amount: '55.00', currency: 'PKR' },
            },
          ],
        };
      },
    };
    const accountsService = {
      async listAccounts() {
        return {
          items: [
            {
              status: 'active',
              accountType: 'cash',
              derivedBalances: { balance: { amount: '500.00', currency: 'PKR' } },
            },
            {
              status: 'active',
              accountType: 'bank',
              derivedBalances: { balance: { amount: '1200.00', currency: 'PKR' } },
            },
            {
              status: 'active',
              accountType: 'jazzcash',
              derivedBalances: { balance: { amount: '80.00', currency: 'PKR' } },
            },
            {
              status: 'active',
              accountType: 'easypaisa',
              derivedBalances: { balance: { amount: '20.00', currency: 'PKR' } },
            },
          ],
        };
      },
      async listExpenses() {
        return {
          items: [
            {
              status: 'posted',
              expenseDate: '2026-08-14',
              amount: { amount: '15.00', currency: 'PKR' },
            },
          ],
        };
      },
    };
    const alerts = createAlertsModule({
      persistence: 'memory',
      inventoryService: inventory.inventoryService,
      paymentsService,
      salesService,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });
    await alerts.alertsService.upsertDeadStockInactivityDays('org-1', 30);

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

    const reporting = createReportingModule({
      salesService,
      purchasesService,
      accountsService,
      paymentsService,
      alertsService: alerts.alertsService,
      returnsService: {
        async listReturns() {
          return { items: [] };
        },
      },
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
      resolvePlanEntitlements: async () => ({ reportsExports: false }),
      now: () => new Date('2026-08-14T05:00:00.000Z'),
    });

    const dashboard = await reporting.reportingService.getDashboard('org-1', ownerContext());
    const expectedGross = computeGrossProfitFromEffects([
      { signedRevenueMinorUnits: '10000', signedCogsMinorUnits: '4000' },
    ]);

    expect(dashboard.todaysSales.amount).toBe('100.00');
    expect(dashboard.todaysPurchases.amount).toBe('55.00');
    expect(dashboard.todaysExpenses.amount).toBe('15.00');
    expect(dashboard.grossProfit.amount).toBe(expectedGross.grossProfit.amount);
    expect(dashboard.cashBalances.amount).toBe('500.00');
    expect(dashboard.bankBalances.amount).toBe('1200.00');
    expect(dashboard.jazzCashBalance.amount).toBe('80.00');
    expect(dashboard.easypaisaBalance.amount).toBe('20.00');
    expect(dashboard.customerReceivables.amount).toBe('100.00');
    expect(dashboard.entitlements.reportsExportsAllowed).toBe(false);
    expect(dashboard).not.toHaveProperty('cachedBalance');
    expect(dashboard).not.toHaveProperty('receivableBalance');
    expect(dashboard.topSellingProducts[0].productId).toBe('prod-a');
    expect(dashboard.recentSales).toHaveLength(1);
  });
});

describe('F08 P1 architecture boundaries', () => {
  it('keeps Alerts/Reporting free of foreign persistence imports and mutation helpers', () => {
    const files = collectSourceFiles(join(backendRoot, 'modules/alerts')).concat(
      collectSourceFiles(join(backendRoot, 'modules/reporting')),
    );
    const violations = [];
    for (const filePath of files) {
      if (filePath.includes('.spec.')) {
        continue;
      }
      for (const specifier of extractImportSpecifiers(filePath)) {
        if (
          specifier.includes('/inventory/persistence/') ||
          specifier.includes('/payments-ledgers/persistence/') ||
          specifier.includes('/sales/persistence/') ||
          specifier.includes('/accounts-expenses/persistence/')
        ) {
          violations.push(`${filePath} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);

    const alertsPublic = readFileSync(join(backendRoot, 'modules/alerts/public/index.js'), 'utf8');
    expect(alertsPublic).not.toMatch(/persistence\//);
    expect(alertsPublic).toMatch(/createAlertsService/);

    const reportingPublic = readFileSync(
      join(backendRoot, 'modules/reporting/public/index.js'),
      'utf8',
    );
    expect(reportingPublic).not.toMatch(/persistence\//);
    expect(reportingPublic).toMatch(/computeGrossProfitFromEffects/);
  });
});
