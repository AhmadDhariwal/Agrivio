import { createServer } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerModule from '../../platform/errors/error-handler.middleware';
import appErrorModule from '../../platform/errors/app-error';
import requestIdModule from '../../platform/http/request-id.middleware';
import inventoryRoutesModule from './routes/inventory.routes';

const { createErrorHandlerMiddleware } = errorHandlerModule;
const { orgCapabilityDisabled } = appErrorModule;
const { createRequestIdMiddleware } = requestIdModule;
const { registerInventoryRoutes } = inventoryRoutesModule;

const RECONCILIATION_PATH = '/api/v1/inventory/reconciliation';

async function withServer(app, work) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
}

function buildApp(assertAllowed, inventoryService) {
  const app = express();
  app.use(createRequestIdMiddleware());
  app.use(
    registerInventoryRoutes({
      requireAuth: (req, _res, next) => {
        req.auth = { session: {}, user: {} };
        req.authContext = {
          contextType: 'organization',
          organizationId: 'org-a',
          userId: 'user-a',
          permissions: ['inventory.view'],
        };
        next();
      },
      requireCsrf: (_req, _res, next) => next(),
      requireOperationalAccess: (_req, _res, next) => next(),
      capabilityService: { assertAllowed },
      inventoryService,
    }),
  );
  app.use(createErrorHandlerMiddleware('test', () => undefined));
  return app;
}

describe('Inventory Reconciliation capability route enforcement — module gate', () => {
  it('blocks reconciliation inquiry when the module is disabled for the organization', async () => {
    const reconcileInventory = vi.fn();

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      if (key === 'inventory.reconciliation') {
        expect(mode).toBe('enabled');
        throw orgCapabilityDisabled('Inventory Reconciliation is disabled', { controlKey: key });
      }
    });

    const app = buildApp(assertAllowed, { reconcileInventory });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${RECONCILIATION_PATH}`);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe('ORG_CAPABILITY_DISABLED');
      expect(reconcileInventory).not.toHaveBeenCalled();
    });
  });

  it('allows reconciliation inquiry when the module is enabled for the organization', async () => {
    const reconcileInventory = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key, mode) => {
      expect(key).toBe('inventory.reconciliation');
      expect(mode).toBe('enabled');
    });

    const app = buildApp(assertAllowed, { reconcileInventory });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${RECONCILIATION_PATH}`);
      expect(response.status).toBe(200);
      expect(reconcileInventory).toHaveBeenCalledOnce();
    });
  });
});

describe('Inventory Reconciliation capability — unrelated module isolation', () => {
  it('Stock balance and movements endpoints remain unaffected when Reconciliation module is disabled', async () => {
    const listBalances = vi.fn(async () => ({ items: [], total: 0 }));
    const listMovements = vi.fn(async () => ({ items: [], total: 0 }));

    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'inventory.reconciliation') {
        throw orgCapabilityDisabled('Inventory Reconciliation is disabled', { controlKey: key });
      }
      if (key === 'inventory.stock') return;
    });

    const app = buildApp(assertAllowed, { listBalances, listMovements });

    await withServer(app, async (baseUrl) => {
      const balances = await fetch(`${baseUrl}/api/v1/inventory/balances`);
      expect(balances.status).toBe(200);
      expect(listBalances).toHaveBeenCalledOnce();

      const movements = await fetch(`${baseUrl}/api/v1/inventory/movements`);
      expect(movements.status).toBe(200);
      expect(listMovements).toHaveBeenCalledOnce();
    });
  });
});
