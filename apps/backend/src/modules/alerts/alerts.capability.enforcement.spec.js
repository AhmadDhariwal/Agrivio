import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { API_ALERTS_PATH, API_NOTIFICATIONS_PATH } from '@agrivio/api-contracts';
import alertsModule from './alerts.module';
import alertsRoutesModule from './routes/alerts.routes';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import appErrorModule from '../../platform/errors/app-error';

const { createAlertsModule } = alertsModule;
const { registerAlertsRoutes } = alertsRoutesModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { orgActionNotAllowed, orgCapabilityDisabled } = appErrorModule;

const openServers = [];

function authContext(userId = 'owner-1') {
  return {
    userId,
    organizationId: 'org-1',
    contextType: 'organization',
    permissions: ['alerts.view'],
  };
}

function createCapabilityHarness() {
  return createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore: createInMemoryAuditEventStore(),
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status: 'active',
      accessLevel: 'operational',
      plan: { entitlements: {} },
    }),
  });
}

function createAlerts(capabilityService) {
  return createAlertsModule({
    persistence: 'memory',
    capabilityService,
    inventoryService: {
      async listBalances() {
        return { items: [] };
      },
      async queryExpiry() {
        return { items: [], businessDate: '2026-08-26', thresholdDays: 30 };
      },
    },
    paymentsService: {
      async listCustomerReceivableBalances() {
        return {
          items: [
            {
              customerId: 'customer-1',
              receivableMinorUnits: '2500',
              receivable: { amount: '25.00', currency: 'PKR' },
            },
          ],
        };
      },
      async listSupplierPayableBalances() {
        return { items: [] };
      },
    },
    salesService: {
      async listPostedSaleProductActivity() {
        return { productIds: [] };
      },
    },
    resolveOrganizationTimezone: async () => 'Asia/Karachi',
    now: () => new Date('2026-08-26T05:00:00.000Z'),
  });
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

describe('Alerts family, read-state, and acknowledgement capability enforcement', () => {
  it('filters a disabled family without changing the raw source calculation or unrelated alerts', async () => {
    const capabilityService = createCapabilityHarness();
    const alerts = createAlerts(capabilityService);
    await alerts.alertsService.upsertLowStockThreshold('org-1', {
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      thresholdQuantityBase: '1',
    });
    await capabilityService.updatePolicy(
      'org-1',
      {
        expectedVersion: 0,
        changes: [
          {
            key: 'alerts.alertTypeAvailability.lowStock',
            value: { enabled: false },
          },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const raw = await alerts.alertsService.listAlerts('org-1', authContext());
    expect(raw.summaries.lowStockCount).toBe(1);
    const projected = await alerts.alertsService.listNotifications(
      'org-1',
      authContext(),
      { enforceCapabilities: true },
    );
    expect(projected.items.map((item) => item.alertType)).toEqual(['customer_dues']);
    expect(projected.summaries.lowStockCount).toBe(0);
    expect(projected.summaries.customerDuesCount).toBe(1);
    expect(projected.summaries.customerDuesAmount.amount).toBe('25.00');

    const stored = await alerts.store.listNotificationItems('org-1');
    const disabledNotification = stored.find((item) => item.alertType === 'low_stock');
    await expect(
      alerts.alertsService.markNotificationRead(
        'org-1',
        'owner-1',
        String(disabledNotification._id),
        authContext(),
        { enforceCapabilities: true },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps read state user-scoped and acknowledgement separate for enabled notifications', async () => {
    const capabilityService = createCapabilityHarness();
    const alerts = createAlerts(capabilityService);
    const userA = authContext('user-a');
    const userB = authContext('user-b');
    const first = await alerts.alertsService.listNotifications('org-1', userA, {
      enforceCapabilities: true,
    });
    const notificationId = first.items[0].id;

    await alerts.alertsService.markNotificationRead(
      'org-1',
      'user-a',
      notificationId,
      userA,
      { enforceCapabilities: true },
    );
    const afterA = await alerts.alertsService.listNotifications('org-1', userA, {
      enforceCapabilities: true,
    });
    const afterB = await alerts.alertsService.listNotifications('org-1', userB, {
      enforceCapabilities: true,
    });
    expect(afterA.items[0]).toMatchObject({ isRead: true, acknowledgedAt: null });
    expect(afterB.items[0].isRead).toBe(false);

    const acknowledged = await alerts.alertsService.acknowledgeNotification(
      'org-1',
      notificationId,
      'user-a',
      userA,
      { enforceCapabilities: true },
    );
    expect(acknowledged.acknowledgedBy).toBe('user-a');
    expect(acknowledged.acknowledgedAt).toBeTruthy();
  });

  it('removes summaries when summary cards are disabled', async () => {
    const capabilityService = createCapabilityHarness();
    const alerts = createAlerts(capabilityService);
    await capabilityService.updatePolicy(
      'org-1',
      {
        expectedVersion: 0,
        changes: [{ key: 'alerts.features.summaryCards', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const result = await alerts.alertsService.listNotifications('org-1', authContext(), {
      enforceCapabilities: true,
    });
    expect(result.summaries).toBeNull();
    expect(result.items).toHaveLength(1);
  });
});

describe('Alerts route capability enforcement', () => {
  it('enforces module, navbar feature, and action controls after existing route gates', async () => {
    const calls = [];
    const capabilityService = {
      async assertAllowed(_organizationId, key, mode) {
        calls.push(`${key}:${mode}`);
      },
    };
    const alertsService = {
      listAlerts: vi.fn(async () => ({ items: [], summaries: {} })),
      getNotificationFeed: vi.fn(async () => ({ items: [], unreadCount: 0 })),
      listNotifications: vi.fn(async () => ({ items: [], summaries: {}, unreadCount: 0 })),
      markAllNotificationsRead: vi.fn(async () => ({ success: true, unreadCount: 0 })),
      markNotificationRead: vi.fn(async () => ({ id: 'notification-1', isRead: true })),
      acknowledgeNotification: vi.fn(async () => ({ id: 'notification-1' })),
    };
    const baseUrl = await bootRoutes(alertsService, capabilityService);

    for (const [method, path] of [
      ['GET', API_ALERTS_PATH],
      ['GET', `${API_NOTIFICATIONS_PATH}/feed`],
      ['GET', API_NOTIFICATIONS_PATH],
      ['POST', `${API_NOTIFICATIONS_PATH}/mark-all-read`],
      ['POST', `${API_NOTIFICATIONS_PATH}/notification-1/read`],
      ['POST', `${API_NOTIFICATIONS_PATH}/notification-1/acknowledge`],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(200);
    }
    expect(calls).toEqual([
      'alerts:enabled',
      'alerts:enabled',
      'alerts.features.navbarNotifications:enabled',
      'alerts:enabled',
      'alerts:enabled',
      'alerts.actions.markAllRead:allowed',
      'alerts:enabled',
      'alerts.actions.markRead:allowed',
      'alerts:enabled',
      'alerts.actions.acknowledge:allowed',
    ]);
  });

  it('does not reach controllers when the module, navbar feature, or action is denied', async () => {
    for (const [path, deniedKey, error] of [
      [API_NOTIFICATIONS_PATH, 'alerts', orgCapabilityDisabled()],
      [
        `${API_NOTIFICATIONS_PATH}/feed`,
        'alerts.features.navbarNotifications',
        orgCapabilityDisabled(),
      ],
      [
        `${API_NOTIFICATIONS_PATH}/notification-1/acknowledge`,
        'alerts.actions.acknowledge',
        orgActionNotAllowed(),
      ],
    ]) {
      const listNotifications = vi.fn();
      const getNotificationFeed = vi.fn();
      const acknowledgeNotification = vi.fn();
      const capabilityService = {
        async assertAllowed(_organizationId, key) {
          if (key === deniedKey) throw error;
        },
      };
      const baseUrl = await bootRoutes(
        { listNotifications, getNotificationFeed, acknowledgeNotification },
        capabilityService,
      );
      const response = await fetch(`${baseUrl}${path}`, {
        method: path.endsWith('/acknowledge') ? 'POST' : 'GET',
      });
      expect(response.status).toBe(403);
      expect(listNotifications).not.toHaveBeenCalled();
      expect(getNotificationFeed).not.toHaveBeenCalled();
      expect(acknowledgeNotification).not.toHaveBeenCalled();
    }
  });
});

async function bootRoutes(alertsService, capabilityService) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals['requestId'] = 'req-test-1';
    next();
  });
  app.use(
    registerAlertsRoutes({
      alertsService,
      capabilityService,
      requireAuth(req, _res, next) {
        req.auth = { userId: 'owner-1' };
        req.authContext = authContext();
        next();
      },
      requireCsrf(_req, _res, next) {
        next();
      },
      requireOperationalAccess(req, _res, next) {
        req.subscriptionAccessState = {
          status: 'active',
          accessLevel: 'operational',
          plan: { entitlements: {} },
        };
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
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
}
