import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { API_DASHBOARD_PATH } from '@agrivio/api-contracts';
import reportingModule from './reporting.module';
import reportingRoutesModule from './routes/reporting.routes';
import reportingServiceModule from './reporting.service';
import appErrorModule from '../../platform/errors/app-error';

const { createReportingModule } = reportingModule;
const { registerReportingRoutes } = reportingRoutesModule;
const { DASHBOARD_CONTROL_KEYS } = reportingServiceModule;
const { orgCapabilityDisabled } = appErrorModule;
const openServers = [];

function authContext() {
  return {
    userId: 'owner-1',
    organizationId: 'org-1',
    contextType: 'organization',
    permissions: ['dashboard.view'],
  };
}

function money(amount) {
  return { amount, currency: 'PKR' };
}

function createProjection(overrides = {}) {
  return {
    controls: Object.entries(DASHBOARD_CONTROL_KEYS).map(([name, key]) => ({
      key,
      effectiveValue: key.includes('.widgets.')
        ? { visible: overrides[name] ?? true }
        : { enabled: overrides[name] ?? true },
    })),
  };
}

function createDashboardService(projection) {
  const sale = {
    id: 'sale-1',
    invoiceNumber: 'INV-1',
    status: 'posted',
    saleDate: '2026-08-29',
    postedAt: '2026-08-29T10:00:00.000Z',
    branchId: 'branch-1',
    warehouseId: 'warehouse-1',
    customerId: 'customer-1',
    saleTotal: money('100.00'),
    paidTotal: money('100.00'),
    cogsTotal: money('60.00'),
    lines: [
      {
        productId: 'product-1',
        productNameSnapshot: 'Seed',
        quantityBase: '2.0000',
        lineProductAmount: money('100.00'),
        cogsTotal: money('60.00'),
      },
    ],
  };
  return createReportingModule({
    capabilityService: { resolveEffective: vi.fn(async () => projection) },
    salesService: { listSales: vi.fn(async () => ({ items: [sale] })) },
    purchasesService: { listPurchases: vi.fn(async () => ({ items: [] })) },
    accountsService: {
      listExpenses: vi.fn(async () => ({ items: [] })),
      listAccounts: vi.fn(async () => ({ items: [] })),
    },
    paymentsService: {
      listCustomerReceivableBalances: vi.fn(async () => ({ items: [] })),
      listSupplierPayableBalances: vi.fn(async () => ({ items: [] })),
    },
    alertsService: {
      getAlertSummaries: vi.fn(async () => ({
        lowStockCount: 1,
        upcomingExpiryCount: 2,
        expiredStockCount: 3,
        deadStock: { count: 4, inactivityDays: 90, items: [] },
      })),
    },
    inventoryService: { listBalances: vi.fn(async () => ({ items: [] })) },
    resolveOrganizationTimezone: async () => 'Asia/Karachi',
    resolvePlanEntitlements: async () => ({ reportsExports: false }),
    now: () => new Date('2026-08-29T12:00:00.000Z'),
  }).reportingService;
}

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

describe('Dashboard capability enforcement', () => {
  it('blocks GET /api/v1/dashboard at the module boundary after RBAC and subscription checks', async () => {
    const capabilityService = {
      assertAllowed: vi.fn(async () => {
        throw orgCapabilityDisabled();
      }),
    };
    const reportingService = { getDashboard: vi.fn() };
    const app = express();
    app.use(
      registerReportingRoutes({
        reportingService,
        capabilityService,
        requireAuth(req, _res, next) {
          req.auth = { userId: 'owner-1' };
          req.authContext = authContext();
          next();
        },
        requireOperationalAccess(req, _res, next) {
          req.subscriptionAccessState = { status: 'active', accessLevel: 'operational' };
          next();
        },
        requireSuspendedReadAccess(_req, _res, next) {
          next();
        },
        requireCsrf(_req, _res, next) {
          next();
        },
      }),
    );
    app.use((error, _req, res, next) => {
      void next;
      res.status(error.statusCode ?? 500).json({ code: error.code });
    });
    const server = createServer(app);
    openServers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP port');

    const response = await fetch(`http://127.0.0.1:${address.port}${API_DASHBOARD_PATH}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'ORG_CAPABILITY_DISABLED' });
    expect(reportingService.getDashboard).not.toHaveBeenCalled();
    expect(capabilityService.assertAllowed).toHaveBeenCalledWith(
      'org-1',
      'dashboard',
      'enabled',
      expect.objectContaining({ permissions: ['dashboard.view'], operationalAllowed: true }),
    );
  });

  it('ignores disabled filter parameters and omits disabled widget-group data', async () => {
    const service = createDashboardService(
      createProjection({
        datePeriodFilter: false,
        branchFilter: false,
        warehouseFilter: false,
        accountSummary: false,
        salesVsPurchasesTrend: false,
        grossProfitTrend: false,
        topSellingProducts: false,
        inventoryHealth: false,
        recentSales: false,
      }),
    );
    const result = await service.getDashboard('org-1', authContext(), {
      fromDate: '2020-01-01',
      toDate: '2020-01-02',
      branchId: 'stale-branch',
      warehouseId: 'stale-warehouse',
    });

    expect(result.period).toEqual({ fromDate: '2026-08-23', toDate: '2026-08-29' });
    expect(result.periodSales).toEqual(money('100.00'));
    expect(result.periodGrossProfit).toEqual(money('40.00'));
    expect(result).not.toHaveProperty('cashBalances');
    expect(result).not.toHaveProperty('accountDistribution');
    expect(result).not.toHaveProperty('salesVsPurchases');
    expect(result).not.toHaveProperty('grossProfitTrend');
    expect(result).not.toHaveProperty('topSellingProducts');
    expect(result).not.toHaveProperty('lowStockCount');
    expect(result).not.toHaveProperty('deadStockSummary');
    expect(result).not.toHaveProperty('recentSales');
  });
});
